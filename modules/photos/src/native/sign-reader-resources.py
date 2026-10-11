"""Xcode build phase: package fixed prepared resources and sign nested native code."""
import os
import shutil
import subprocess
from pathlib import Path

source = Path(os.environ['PHOTOS_READER_RESOURCES']).resolve(strict=True)
target = Path(os.environ['TARGET_BUILD_DIR']) / os.environ['UNLOCALIZED_RESOURCES_FOLDER_PATH']
if not (source / 'reader-config.json').is_file() or not (source / 'reader-bootstrap.py').is_file():
    raise RuntimeError('Prepare the private Photos Reader resources before building')
if any(path.is_symlink() for path in source.rglob('*')):
    raise RuntimeError('Prepared reader resources must be self-contained')
if source != target.resolve():
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
magic = {bytes.fromhex(x) for x in ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']}
code = []
for path in target.rglob('*'):
    if path.is_symlink():
        raise RuntimeError('Photos Reader resources must be self-contained')
    if path.is_file():
        with path.open('rb') as stream:
            if stream.read(4) in magic:
                code.append(str(path))
if os.environ.get('CODE_SIGNING_ALLOWED') == 'YES':
    identity = os.environ.get('EXPANDED_CODE_SIGN_IDENTITY', '')
    if not identity or identity == '-':
        raise RuntimeError('A stable signing identity is required')
    if code:
        result = subprocess.run(['/usr/bin/codesign', '--sign', identity, '--force', '--options', 'runtime', '--timestamp=none', *code])
        if result.returncode:
            raise RuntimeError('Nested reader code signing failed')
