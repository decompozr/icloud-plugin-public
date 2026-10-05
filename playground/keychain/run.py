"""Run the synthetic macOS Keychain experiment; never access application custody.

Requires existing swiftc, codesign, bun and a logged-in macOS GUI session.
Creates exactly one UUID-namespaced item and one transient LaunchAgent.
Raw results stay in an owner-only temporary directory for explicit reconciliation.
"""
import datetime
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import uuid

if sys.platform != "darwin":
    raise SystemExit("This experiment requires macOS.")
for executable in ("swiftc", "codesign", "bun", "launchctl"):
    if shutil.which(executable) is None:
        raise SystemExit(f"Required existing tool unavailable: {executable}")

root = Path(tempfile.mkdtemp(prefix="icloud-keychain-experiment."))
service = "local.icloud-plugin.experiment." + str(uuid.uuid4())
domain = f"gui/{os.getuid()}"
label = service
binary = root / "probe"
backup = root / "probe-v1"
updated = root / "probe-v2"
source = Path(__file__).resolve().with_name("Probe.swift")
results = []
record = dict(owner="experiment-runner", task="experiment-keychain-custody", status="active",
              updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              service=service, launch_domain=domain, launch_label=label, artifacts=str(root),
              knowledge_destination="playground/keychain/README.md", writers=[os.getpid()])


def save():
    (root / "record.json").write_text(json.dumps(record, indent=2) + "\n")
    (root / "results.json").write_text(json.dumps(results, indent=2) + "\n")


def command(case, argv, expected=0, timeout=20):
    process = subprocess.run([str(arg) for arg in argv], text=True, capture_output=True, timeout=timeout)
    item = dict(case=case, exit=process.returncode, output=process.stdout.strip(), stderr=process.stderr.strip())
    results.append(item)
    save()
    if expected is not None and process.returncode != expected:
        raise RuntimeError(f"{case}: unexpected exit {process.returncode}; see {root}/results.json")
    return process


def read(case, path, expected=0):
    process = command(case, [path, "read", service], expected)
    value = json.loads(process.stdout)
    if expected == 0:
        assert value["status"] == 0 and value["byteCount"] == 32
        assert value["digest"] == digest
    else:
        assert value["status"] != 0 and "digest" not in value


print(f"Experiment artifacts: {root}", flush=True)
save()
launched = False
passed = False
cleanup_okay = False
try:
    command("compile-v1", ["swiftc", source, "-o", binary])
    command("sign-v1", ["codesign", "--force", "--sign", "-", "--identifier", "local.icloud-plugin.experiment.probe", binary])
    shutil.copy2(binary, backup)
    command("keychain-status", [binary, "status", service])
    command("create", [binary, "create", service], timeout=60)
    first = command("first-read", [binary, "read", service])
    value = json.loads(first.stdout)
    assert value["status"] == 0 and value["byteCount"] == 32
    digest = value["digest"]
    for attempt in range(3):
        read(f"repeat-read-{attempt + 1}", binary)
    duplicate = command("duplicate-create", [binary, "create", service], 1)
    assert json.loads(duplicate.stdout)["status"] == -25299
    moved = root / "release-copy"
    moved.mkdir()
    shutil.copy2(binary, moved / "probe")
    read("same-binary-new-path", moved / "probe")
    command("compile-v2", ["swiftc", "-D", "UPDATED", source, "-o", updated])
    command("sign-v2", ["codesign", "--force", "--sign", "-", "--identifier", "local.icloud-plugin.experiment.probe", updated])
    command("identity-v1", ["codesign", "-d", "-r-", binary])
    command("identity-v2", ["codesign", "-d", "-r-", updated])
    read("new-binary-same-identifier", updated, 1)
    try:
        shutil.copy2(updated, binary)
        read("replacement-at-original-path", binary, 1)
    finally:
        shutil.copy2(backup, binary)
    read("restored-original", binary)
    script = ('const p=Bun.spawn([Bun.argv[1],"read",Bun.argv[2]],{stdout:"pipe",stderr:"pipe"});'
              'process.stdout.write(await new Response(p.stdout).text());'
              'process.stderr.write(await new Response(p.stderr).text());process.exitCode=await p.exited;')
    child = command("bun-child-read", ["bun", "--eval", script, binary, service])
    assert json.loads(child.stdout)["digest"] == digest
    plist = root / "probe.plist"
    plist.write_bytes(plistlib.dumps(dict(Label=label, ProgramArguments=[str(binary), "read", service],
                                         RunAtLoad=True, StandardOutPath=str(root / "launch.stdout"),
                                         StandardErrorPath=str(root / "launch.stderr"))))
    # Record possible registration before bootstrap so a lost result is reconciled.
    launched = True
    command("launchagent-bootstrap", ["launchctl", "bootstrap", domain, plist])
    # Finite wait for this one-shot job's output; no KeepAlive or retrying reader.
    import time
    for attempt in range(50):
        output = root / "launch.stdout"
        if output.exists() and output.stat().st_size:
            break
        time.sleep(0.1)
    value = json.loads(output.read_text())
    assert value["status"] == 0 and value["digest"] == digest
    results.append(dict(case="launchagent-read", output=value, stderr=(root / "launch.stderr").read_text()))
    save()
    passed = True
finally:
    errors = []
    if launched:
        try:
            present = command("launchagent-inspect", ["launchctl", "print", domain + "/" + label], None)
            if present.returncode == 0:
                command("launchagent-bootout", ["launchctl", "bootout", domain + "/" + label])
            absent = command("launchagent-absent", ["launchctl", "print", domain + "/" + label], None)
            assert absent.returncode != 0 and "Could not find service" in absent.stderr and label in absent.stderr
        except Exception as error:
            errors.append(str(error))
    if backup.exists():
        shutil.copy2(backup, binary)
        try:
            removed = command("delete", [binary, "delete", service], None)
            assert json.loads(removed.stdout)["status"] in (0, -25300)
            absent = command("read-after-delete", [binary, "read", service], 1)
            assert json.loads(absent.stdout)["status"] == -25300
            repeated = command("delete-again", [binary, "delete", service], 1)
            assert json.loads(repeated.stdout)["status"] == -25300
        except Exception as error:
            errors.append(str(error))
    cleanup_okay = not errors
    record.update(status="complete" if passed and cleanup_okay else "interrupted", writers=[],
                  cleanup_errors=errors, retained_reason="Local experiment evidence; no remote publication authorized")
    save()
    print(json.dumps(dict(passed=passed, cleanup_verified=cleanup_okay, artifacts=str(root))))
    if errors:
        raise RuntimeError("Cleanup requires reconciliation; see experiment record.")
