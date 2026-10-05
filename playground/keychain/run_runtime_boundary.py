"""K0 negative control: signed stock Bun compilation is not a fixed-entry runtime.

No Keychain, network, application state, identities, or installation is accessed.
Only an ad-hoc signature is applied to a task-owned synthetic executable. Raw
logs remain outside Git; transient binaries/scripts are removed before return.
A reproduced negative finding is NOT a passing K0 security gate.
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


def main():
    if sys.platform != "darwin":
        raise SystemExit("This bounded experiment requires macOS.")
    for tool in ("bun", "codesign"):
        if shutil.which(tool) is None:
            raise SystemExit(f"Existing dependency unavailable: {tool}")
    root = Path(tempfile.mkdtemp(prefix="icloud-keychain-k0-runtime."))
    os.chmod(root, 0o700)
    payload = root / "payload"
    payload.mkdir(mode=0o700)
    binary = payload / "sealed-runtime"
    entry = payload / "entry.ts"
    alternate = payload / "alternate.ts"
    preload = payload / "preload.ts"
    entitlements = payload / "jit.plist"
    baseline = 'console.log(JSON.stringify({case:"fixed-entry",pid:process.pid}));'
    alternate.write_text('console.log(JSON.stringify({case:"alternate-script",pid:process.pid}));')
    preload.write_text('console.log(JSON.stringify({case:"external-preload",pid:process.pid}));')
    # Deliberately clear hostile code-loading inputs inherited by the harness.
    env = {k: v for k, v in os.environ.items() if not k.startswith(("BUN_", "NODE_", "DYLD_", "JSC_"))}
    logs = []
    record = {"task": "dual-keychain-K0-runtime-boundary", "owner": "main-agent",
              "status": "active", "writers": [os.getpid()], "artifacts": str(root),
              "scope": "synthetic stock Bun code-loading controls; no Keychain or signer identity",
              "knowledge_destination": "playground/keychain/runtime-boundary.md"}

    def save():
        record["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for name, value in (("record.json", record), ("results.json", logs)):
            path = root / name
            path.write_text(json.dumps(value, indent=2) + "\n")
            path.chmod(0o600)

    def run(case, argv, extra=None, required=True):
        completed = subprocess.run([str(a) for a in argv], cwd=payload,
                                   env=env | (extra or {}), capture_output=True,
                                   text=True, timeout=60)
        logs.append({"case": case, "exit": completed.returncode,
                     "stdout": completed.stdout, "stderr": completed.stderr})
        save()
        if required and completed.returncode != 0:
            raise RuntimeError(f"{case}: exit {completed.returncode}; see {root}/results.json")
        return completed

    def cases(output):
        found = []
        for line in output.splitlines():
            item = json.loads(line)
            assert isinstance(item, dict) and set(item) == {"case", "pid"}
            assert type(item["pid"]) is int and item["pid"] > 0
            found.append(item)
        return found

    print(f"Experiment record: {root}/record.json", flush=True)
    save()
    summary = None
    try:
        version = run("bun-version", ["bun", "--version"]).stdout.strip()
        # Even an entry-point environment guard runs too late for CLI replacement
        # and preloads. It emits only nonsecret test labels.
        entry.write_text('if(process.env.BUN_BE_BUN||process.env.BUN_OPTIONS)process.exit(64);' + baseline)
        run("compile", ["bun", "build", "--compile", "--no-compile-autoload-dotenv",
                        "--no-compile-autoload-bunfig", "--no-compile-autoload-tsconfig",
                        "--no-compile-autoload-package-json", entry, "--outfile", binary])
        entitlements.write_bytes(plistlib.dumps({"com.apple.security.cs.allow-jit": True}))
        run("sign-hardened-synthetic", ["codesign", "--force", "--sign", "-", "--options", "runtime",
                                        "--entitlements", entitlements, "--identifier",
                                        "local.icloud-plugin.experiment.runtime-boundary", binary])
        run("verify-before", ["codesign", "--verify", "--strict", binary])
        requirement_before = run("requirement-before", ["codesign", "-d", "-r-", binary]).stdout
        assert "designated =>" in requirement_before, "No designated requirement observed"
        before = hashlib.sha256(binary.read_bytes()).hexdigest()
        normal = run("fixed-entry", [binary])
        assert [x.get("case") for x in cases(normal.stdout)] == ["fixed-entry"]
        switched = run("bun-be-bun-alternate", [binary, alternate], {"BUN_BE_BUN": "1"})
        assert [x.get("case") for x in cases(switched.stdout)] == ["alternate-script"]
        loaded = run("bun-options-preload", [binary], {"BUN_OPTIONS": f"--preload={preload}"}, required=False)
        assert loaded.returncode == 64, "Entry guard did not return its expected failure status"
        preload_executed = [x.get("case") for x in cases(loaded.stdout)] == ["external-preload"]
        assert preload_executed, "Expected negative control not reproduced; inspect logs, do not claim safety"
        run("verify-after", ["codesign", "--verify", "--strict", binary])
        requirement_after = run("requirement-after", ["codesign", "-d", "-r-", binary]).stdout
        assert before == hashlib.sha256(binary.read_bytes()).hexdigest()
        assert requirement_before == requirement_after
        # Same OS PID across preload/entry would be relevant only if entry runs;
        # here the guard may terminate it after the unauthorized preload already ran.
        summary = {"format": 1, "bun": version, "platform": sys.platform,
                   "verification": "same-agent self-checking",
                   "signature": "ad-hoc, hardened runtime, allow-jit only",
                   "autoload_config": False, "entry_environment_guard": True,
                   "fixed_entry_passed": True, "alternate_script_executed": True,
                   "external_preload_executed": preload_executed,
                   "signature_and_executable_unchanged": True,
                   "negative_finding_reproduced": True, "k0_gate_passed": False,
                   "keychain_operations": 0, "production_signer_tested": False}
        record["status"] = "complete-negative-finding"
    except BaseException as error:
        record["status"] = "failed-or-interrupted"
        record["error_type"] = type(error).__name__
        raise
    finally:
        # Every artifact removed here was created exclusively by this invocation.
        shutil.rmtree(payload)
        record["writers"] = []
        record["transient_payload_removed"] = not payload.exists()
        if summary is not None:
            summary["transient_payload_removed"] = record["transient_payload_removed"]
            summary_path = root / "summary.json"
            summary_path.write_text(json.dumps(summary, indent=2) + "\n")
            summary_path.chmod(0o600)
        save()
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
