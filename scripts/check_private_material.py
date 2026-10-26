#!/usr/bin/env python3
"""Local staged-file privacy checks. Never prints matched values or uses network."""
import hashlib
import json
from pathlib import PurePosixPath
import re
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL)


def check():
    names = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').decode().split('\0')
    try:
        provenance = json.loads(git('show', ':.privacy-assets.json')).get('assets', {})
    except (subprocess.CalledProcessError, ValueError, TypeError):
        provenance = {}
    problems = []
    sensitive_path = re.compile(r'(^|/)(?:private-archive|private-captures|personal-exports|\.private|\.env)(/|$)|(^|/)\.env\.(?!example$|sample$)')
    patterns = {
        'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
        'GitHub credential': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b',
        'cloud credential': rb'\bAKIA[0-9A-Z]{16}\b',
        'API credential': rb'\bsk-proj-[A-Za-z0-9_-]{32,}\b',
    }
    for name in filter(None, names):
        if sensitive_path.search(name):
            problems.append((name, 'private capture/runtime path'))
        data = git('show', ':' + name)
        for category, pattern in patterns.items():
            if re.search(pattern, data):
                problems.append((name, category))
        if PurePosixPath(name).suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.heic', '.mov', '.mp4', '.pdf'}:
            entry = provenance.get(name, {})
            if entry.get('sha256') != hashlib.sha256(data).hexdigest() or entry.get('category') not in {'synthetic-ui', 'owner-authored-design', 'public-reference'} or not entry.get('reviewed_by'):
                problems.append((name, 'missing matching reviewed asset provenance'))
    for name, category in problems:
        print(f'{name}: {category}', file=sys.stderr)
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(check())
