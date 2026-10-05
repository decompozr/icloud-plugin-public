"""Synthetic auth helper tests: no package install, credentials or network."""
import contextlib
import io
import json
import logging
import runpy
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

probe = runpy.run_path(str(Path(__file__).with_name("cloud-auth-probe.py")))


class AuthTests(unittest.TestCase):
    def args(self, root):
        return SimpleNamespace(state_dir=Path(root) / "isolated", domain="com")

    def test_preflight_version_dependency_and_exact_commit(self):
        with self.assertRaisesRegex(probe["Gate"], "Python"):
            probe["preflight"]((3, 9), lambda _: self.fail("dependency inspected before version gate"))
        for origin in [{}, {"url": probe["UPSTREAM"], "vcs_info": {"commit_id": "wrong"}}]:
            with self.assertRaises(probe["Gate"]):
                probe["preflight"]((3, 12), lambda _: SimpleNamespace(read_text=lambda _: json.dumps(origin)))
        good = {"url": probe["UPSTREAM"] + ".git", "vcs_info": {"commit_id": probe["PIN"]}}
        probe["preflight"]((3, 12), lambda _: SimpleNamespace(read_text=lambda _: json.dumps(good)))

    def test_preflight_and_tty_fail_before_prompt_or_state(self):
        with tempfile.TemporaryDirectory() as root:
            args = self.args(root)
            def fail():
                raise probe["Gate"]("missing dependency")
            for check, tty in [(fail, True), (lambda: None, False)]:
                with self.assertRaises(probe["Gate"]):
                    probe["run"](args, prompt=lambda _: self.fail("prompt called"), tty=tty, check=check)
                self.assertFalse(args.state_dir.exists())

    def test_hidden_inputs_verified_trust_private_files_and_auth_only(self):
        with tempfile.TemporaryDirectory() as root:
            args = self.args(root)
            answers = iter(["fixture@example.invalid", "synthetic-password", "123456"])
            calls = []
            class Service:
                requires_2fa = True
                requires_2sa = True
                is_trusted_session = False
                data = {"webservices": {"ckdatabasews": {"url": "https://fixture.invalid"}}}
                session = SimpleNamespace(close=lambda: calls.append("close"))
                def trigger_push_notification(self):
                    calls.append("push")
                    return True
                def validate_2fa_code(self, code):
                    self.requires_2fa = self.requires_2sa = False
                    self.is_trusted_session = True
                    calls.append(code)
                    return True
                @property
                def photos(self):
                    raise AssertionError("Photos queried in auth-only helper")
            def factory(domain, account, password, **options):
                self.assertEqual(password(), "synthetic-password")
                self.assertIsNone(options["response_observer"])
                self.assertTrue(options["verify"])
                self.assertFalse(options["with_family"])
                self.assertEqual(options["http_timeout"], 15.0)
                Path(options["cookie_directory"], "session").write_text("synthetic-state")
                logging.warning("must not leak diagnostic")
                return Service()
            result = probe["run"](args, factory, lambda _: next(answers), tty=True, check=lambda: None)
            self.assertEqual(calls, ["push", "123456", "close"])
            self.assertEqual(result["status"], "authenticated")
            self.assertFalse(result["photos_metadata_read"])
            self.assertNotIn("fixture", json.dumps(result))
            self.assertEqual(stat.S_IMODE(args.state_dir.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((args.state_dir / "session").stat().st_mode), 0o600)

    def test_existing_state_and_insecure_session_files_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            args = self.args(root)
            args.state_dir.mkdir(mode=0o700)
            with self.assertRaisesRegex(probe["Gate"], "already exists"):
                probe["state_target"](args.state_dir)
            file = args.state_dir / "session"
            file.write_text("synthetic")
            file.chmod(0o644)
            with self.assertRaisesRegex(probe["Gate"], "permission"):
                probe["check_permissions"](args.state_dir)

    def test_false_success_from_provider_is_not_certified(self):
        with tempfile.TemporaryDirectory() as root:
            state = self.args(root).state_dir
            state.mkdir(mode=0o700)
            service = SimpleNamespace(requires_2fa=True, requires_2sa=True, is_trusted_session=False,
                                      trigger_push_notification=lambda: True, validate_2fa_code=lambda _: True,
                                      session=SimpleNamespace(close=lambda: None))
            values = iter(["fixture", "123456"])
            with self.assertRaisesRegex(probe["Gate"], "not confirmed"):
                probe["authenticate"](lambda *a, **kw: service, state, "com", lambda _: next(values))

    def test_cli_suppresses_raw_provider_exception(self):
        output = io.StringIO()
        def failure(_):
            raise RuntimeError("SECRET response https://private.invalid/token")
        with patch.dict(probe["main"].__globals__, {"run": failure}), patch("sys.argv", ["helper", "--state-dir", "/unused"]), contextlib.redirect_stdout(output):
            self.assertEqual(probe["main"](), 1)
        self.assertNotIn("SECRET", output.getvalue())
        self.assertNotIn("private.invalid", output.getvalue())


if __name__ == "__main__":
    unittest.main()
