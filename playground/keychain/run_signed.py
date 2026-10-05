"""Isolated certificate-pinned multi-version Keychain experiment, not a release signer.

No signing identities or trust settings are added to login/system keychains.
Temporary private signing material and the disposable keychain are removed in finally.
Only synthetic values are used; the probe never exports plaintext.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

if sys.platform != "darwin":
    raise SystemExit("Requires macOS.")
for tool in ("swiftc", "codesign", "security", "openssl", "bun", "launchctl"):
    if shutil.which(tool) is None:
        raise SystemExit(f"Required existing tool unavailable: {tool}")

source = Path(__file__).resolve().parent
root = Path(tempfile.mkdtemp(prefix="icloud-keychain-signed."))
service = "local.icloud-plugin.experiment." + str(uuid.uuid4())
identifier = "local.icloud-plugin.experiment.probe"
domain = f"gui/{os.getuid()}"
keychain = root / "signing.keychain"
admin = root / "sandbox"
# This password protects only disposable experimental material, never real credentials.
password = "disposable-synthetic-keychain"
results = []
record = dict(owner="signed-experiment-runner", task="experiment-keychain-custody", status="active",
              updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              artifacts=str(root), service=service, launch_label=service, launch_domain=domain,
              keychain=str(keychain), writers=[os.getpid()],
              knowledge_destination="playground/keychain/README.md")


def save():
    (root / "record.json").write_text(json.dumps(record, indent=2) + "\n")
    (root / "results.json").write_text(json.dumps(results, indent=2) + "\n")


def command(case, argv, expected=0, stdin=None, retain_output=True, timeout=20):
    process = subprocess.run([str(arg) for arg in argv], input=stdin, capture_output=True,
                             text=True, timeout=timeout)
    results.append(dict(case=case, exit=process.returncode,
                        output=process.stdout.strip() if retain_output else "omitted",
                        stderr=process.stderr.strip()))
    save()
    if expected is not None and process.returncode != expected:
        raise RuntimeError(f"{case}: exit {process.returncode}; see {root}/results.json")
    return process


def certificate(name):
    pem, private, der, p12 = (root / f"{name}.{suffix}" for suffix in ("pem", "key", "der", "p12"))
    command(f"certificate-{name}", ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256",
            "-nodes", "-keyout", private, "-out", pem, "-days", "1", "-subj", f"/CN=icloud-test-{service.rsplit('.', 1)[1][:12]}-{name}",
            "-addext", "basicConstraints=critical,CA:false", "-addext", "keyUsage=critical,digitalSignature",
            "-addext", "extendedKeyUsage=critical,codeSigning"])
    command(f"der-{name}", ["openssl", "x509", "-in", pem, "-outform", "DER", "-out", der])
    command(f"package-{name}", ["openssl", "pkcs12", "-export", "-inkey", private, "-in", pem,
            "-out", p12, "-passout", "pass:disposable-synthetic-identity", "-macalg", "sha1", "-keypbe", "PBE-SHA1-3DES",
            "-certpbe", "PBE-SHA1-3DES"])
    command(f"import-{name}", ["security", "import", p12, "-k", keychain, "-P", "disposable-synthetic-identity", "-T", "/usr/bin/codesign"])
    return hashlib.sha1(der.read_bytes()).hexdigest(), der


def sign(case, binary, signer, signing_identifier=identifier):
    fingerprint, der = signer
    requirement = f'designated => identifier "{signing_identifier}" and anchor = "{der}"'
    command(case, ["codesign", "--force", "--sign", fingerprint, "--keychain", keychain,
                  "--identifier", signing_identifier, "--requirements", "=" + requirement, binary])
    command(case + "-verify", ["codesign", "--verify", "--strict", binary])
    description = command(case + "-identity", ["codesign", "-d", "-r-", binary])
    assert f'certificate root = H"{fingerprint}"' in description.stdout
    assert f'identifier "{signing_identifier}"' in description.stdout and "cdhash" not in description.stdout


def read(case, binary, expect=0):
    result = command(case, [binary, "read", service, keychain], expect)
    value = json.loads(result.stdout)
    if expect == 0:
        assert value["status"] == 0 and value["byteCount"] == 32 and value["digest"] == digest
    else:
        assert value["status"] != 0 and "digest" not in value
    return value


print(f"Experiment artifacts: {root}", flush=True)
save()
baseline_search = command("search-list-before", ["security", "list-keychains", "-d", "user"]).stdout
baseline_default = command("default-keychain-before", ["security", "default-keychain", "-d", "user"]).stdout
created = False
launched = False
passed = False
v1 = root / "v1"
stable = root / "installed-helper"
try:
    command("compile-sandbox", ["swiftc", source / "Sandbox.swift", "-o", admin])
    # Mark possible effects first, so timeout/ambiguous creation is reconciled in finally.
    created = True
    command("create-isolated-keychain", [admin, "create", keychain], stdin=password)
    assert command("search-list-after-create", ["security", "list-keychains", "-d", "user"]).stdout == baseline_search
    assert command("default-after-create", ["security", "default-keychain", "-d", "user"]).stdout == baseline_default
    signer = certificate("signer-a")
    other = certificate("signer-b")
    # Only experimental signing keys in this exact temporary keychain are affected.
    command("allow-codesign-experimental-keys", ["security", "set-key-partition-list", "-S", "apple-tool:,apple:",
            "-s", "-k", password, keychain], retain_output=False)
    versions = []
    for version, flag in (("v1", None), ("v2", "UPDATED"), ("v3", "THIRD_VERSION")):
        binary = root / version
        flags = [] if flag is None else ["-D", flag]
        command("compile-" + version, ["swiftc", *flags, source / "Probe.swift", "-o", binary])
        sign("sign-" + version, binary, signer)
        versions.append(binary)
    # Prove the actual executable bytes change, rather than testing identical copies.
    hashes = [hashlib.sha256(binary.read_bytes()).hexdigest() for binary in versions]
    assert len(set(hashes)) == 3
    results.append(dict(case="three-distinct-binaries", sha256=hashes))
    save()
    command("create-with-v1", [v1, "create", service, keychain])
    first = command("first-read-v1", [v1, "read", service, keychain])
    initial = json.loads(first.stdout)
    assert initial["status"] == 0 and initial["byteCount"] == 32
    digest = initial["digest"]
    for binary in versions:
        for attempt in range(3):
            read(f"{binary.name}-repeat-{attempt + 1}", binary)
        shutil.copy2(binary, stable)
        read(f"{binary.name}-installed-path", stable)
    read("rollback-v1", v1)
    outsider = root / "other-signer"
    shutil.copy2(versions[-1], outsider)
    sign("sign-other-signer", outsider, other)
    read("deny-other-signer-same-identifier", outsider, 1)
    wrong_id = root / "other-identifier"
    shutil.copy2(versions[-1], wrong_id)
    sign("sign-other-identifier", wrong_id, signer, identifier + ".other")
    read("deny-same-signer-other-identifier", wrong_id, 1)
    adhoc = root / "adhoc"
    shutil.copy2(versions[-1], adhoc)
    command("sign-adhoc", ["codesign", "--force", "--sign", "-", "--identifier", identifier, adhoc])
    read("deny-adhoc-same-identifier", adhoc, 1)
    read("v3-after-negative-controls", versions[-1])
    script = ('const p=Bun.spawn([Bun.argv[1],"read",Bun.argv[2],Bun.argv[3]],{stdout:"pipe",stderr:"pipe"});'
              'process.stdout.write(await new Response(p.stdout).text());'
              'process.stderr.write(await new Response(p.stderr).text());process.exitCode=await p.exited;')
    bun = command("bun-child-v3", ["bun", "--eval", script, stable, service, keychain])
    assert json.loads(bun.stdout)["digest"] == digest
    plist = root / "probe.plist"
    plist.write_bytes(plistlib.dumps(dict(Label=service, ProgramArguments=[str(stable), "read", service, str(keychain)],
                                         RunAtLoad=True, StandardOutPath=str(root / "launch.stdout"),
                                         StandardErrorPath=str(root / "launch.stderr"))))
    launched = True
    command("launchagent-bootstrap", ["launchctl", "bootstrap", domain, plist])
    for attempt in range(50):
        output = root / "launch.stdout"
        if output.exists() and output.stat().st_size:
            break
        time.sleep(0.1)
    value = json.loads(output.read_text())
    assert value["status"] == 0 and value["build"] == "v3" and value["digest"] == digest
    results.append(dict(case="launchagent-v3", output=value, stderr=(root / "launch.stderr").read_text()))
    save()
    passed = True
finally:
    errors = []
    if launched:
        try:
            exists = command("launchagent-inspect", ["launchctl", "print", domain + "/" + service], None)
            if exists.returncode == 0:
                command("launchagent-bootout", ["launchctl", "bootout", domain + "/" + service])
            absent = command("launchagent-absent", ["launchctl", "print", domain + "/" + service], None)
            assert absent.returncode != 0 and "Could not find service" in absent.stderr and service in absent.stderr
        except Exception as error:
            errors.append(str(error))
    if created:
        try:
            if v1.exists():
                removed = command("delete-synthetic-item", [v1, "delete", service, keychain], None)
                assert json.loads(removed.stdout)["status"] in (0, -25300)
                absent = command("item-absent", [v1, "read", service, keychain], 1)
                assert json.loads(absent.stdout)["status"] == -25300
            command("delete-isolated-keychain", [admin, "delete", keychain])
            assert not keychain.exists() and not Path(str(keychain) + "-db").exists()
        except Exception as error:
            errors.append(str(error))
    # Private signing material must not remain as experiment evidence.
    for pattern in ("*.key", "*.p12"):
        for private in root.glob(pattern):
            private.unlink()
    try:
        assert command("search-list-after", ["security", "list-keychains", "-d", "user"]).stdout == baseline_search
        assert command("default-keychain-after", ["security", "default-keychain", "-d", "user"]).stdout == baseline_default
    except Exception as error:
        errors.append(str(error))
    record.update(status="complete" if passed and not errors else "interrupted", writers=[],
                  cleanup_errors=errors, private_material_removed=True,
                  retained_reason="Nonsecret local experiment evidence; publication not authorized")
    save()
    print(json.dumps(dict(passed=passed, cleanup_verified=not errors, artifacts=str(root))))
    if errors:
        raise RuntimeError("Cleanup needs reconciliation; see experiment record.")
