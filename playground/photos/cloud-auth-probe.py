#!/usr/bin/env python3
"""User-run, auth-only direct HTTP experiment; never reads Photos assets.

Reference: icloudpd commit 879c561240d993d748ddb4546f935090502b16d3,
src/pyicloud_ipd/base.py. Requires an explicitly provisioned isolated environment.
Passwords and verification codes belong only in this terminal, never in chat.
"""
import argparse
import getpass
import importlib.metadata
import json
import logging
import os
import stat
import sys
import warnings
from pathlib import Path

PIN = "879c561240d993d748ddb4546f935090502b16d3"
UPSTREAM = "https://github.com/icloud-photos-downloader/icloud_photos_downloader"


class Gate(Exception):
    """Only static, non-secret messages may be used."""


def preflight(version=None, distribution=importlib.metadata.distribution):
    version = sys.version_info[:2] if version is None else version
    if not (3, 10) <= version < (3, 14):
        raise Gate("requires isolated Python 3.10 through 3.13; no login attempted")
    try:
        package = distribution("icloudpd")
        origin = json.loads(package.read_text("direct_url.json") or "{}")
    except (importlib.metadata.PackageNotFoundError, ValueError):
        raise Gate("pinned icloudpd dependency missing; no login attempted") from None
    if origin.get("url", "").removesuffix(".git") != UPSTREAM or origin.get("vcs_info", {}).get("commit_id") != PIN:
        raise Gate("icloudpd must be installed from the documented pinned Git commit")


def state_target(path):
    root = Path(__file__).resolve().parents[2]
    if not path.is_absolute() or path.is_symlink():
        raise Gate("state directory must be an explicit absolute external path")
    target = path.resolve()
    if target == root or root in target.parents:
        raise Gate("state directory must be outside the repository")
    if path.exists():
        raise Gate("state directory already exists; choose a new isolated directory")
    if not target.parent.is_dir():
        raise Gate("state directory parent must already exist")
    return target


def check_permissions(directory):
    for path in [directory] + list(directory.iterdir()):
        info = path.lstat()
        expected = 0o700 if path == directory else 0o600
        if (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != expected
                or (path != directory and not stat.S_ISREG(info.st_mode))):
            raise Gate("session state permission check failed; authentication not certified")


def authenticate(factory, directory, domain, prompt=getpass.getpass):
    account = prompt("Apple Account (hidden): ").strip()
    if not account:
        raise Gate("Apple Account is required")
    service = None
    try:
        service = factory(domain, account, lambda: prompt("Apple Account password (hidden): "),
                          response_observer=None, cookie_directory=str(directory),
                          verify=True, with_family=False, http_timeout=15.0)
        if service.requires_2fa:
            if not service.trigger_push_notification():
                raise Gate("trusted-device code request failed; no retry attempted")
            code = prompt("Approve on your trusted device; verification code (hidden): ")
            if len(code) != 6 or not code.isascii() or not code.isdigit():
                raise Gate("verification code must be six digits; no retry attempted")
            if not service.validate_2fa_code(code):
                raise Gate("verification was not confirmed; no retry attempted")
        if service.requires_2fa or service.requires_2sa or not service.is_trusted_session:
            raise Gate("trusted session not confirmed; additional authentication requires user help")
        # Access only local accountLogin discovery metadata, never service.photos.
        photos_advertised = bool(service.data.get("webservices", {}).get("ckdatabasews", {}).get("url"))
        check_permissions(directory)
        return {"status": "authenticated", "trusted_session": True,
                "photos_service_advertised": photos_advertised,
                "photos_metadata_read": False, "photos_search_verified": False,
                "scope": "authentication only; account and trust/session state created"}
    finally:
        if service is not None:
            service.session.close()


def run(args, factory=None, prompt=getpass.getpass, tty=None, check=preflight):
    check()
    terminal = sys.stdin.isatty() and sys.stderr.isatty() if tty is None else tty
    if not terminal:
        raise Gate("run in your own interactive terminal; no secrets accepted through pipes")
    directory = state_target(args.state_dir)
    # Disabling diagnostic logging is process-local. Never enable upstream HTTP logs.
    prior_logging = logging.root.manager.disable
    prior_umask = os.umask(0o077)
    prior_bytecode = sys.dont_write_bytecode
    logging.disable(sys.maxsize)
    sys.dont_write_bytecode = True
    try:
        if factory is None:
            from pyicloud_ipd.base import PyiCloudService
            factory = PyiCloudService
        directory.mkdir(mode=0o700)
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            return authenticate(factory, directory, args.domain, prompt)
    finally:
        sys.dont_write_bytecode = prior_bytecode
        logging.disable(prior_logging)
        os.umask(prior_umask)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", required=True, type=Path)
    parser.add_argument("--domain", choices=["com", "cn"], default="com")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), indent=2))
        return 0
    except Gate as error:
        print(json.dumps({"status": "needs_user_help", "reason": str(error), "photos_metadata_read": False}))
    except (Exception, KeyboardInterrupt):
        # Raw upstream exceptions can include tokens, response bodies, URLs or names.
        print(json.dumps({"status": "needs_user_help", "reason": "authentication stopped; private diagnostics suppressed", "photos_metadata_read": False}))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
