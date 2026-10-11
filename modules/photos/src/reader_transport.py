"""Fixed Launch Services read transport for metadata preconditions; no host DB read."""
import json
import subprocess
import tempfile
import time
from pathlib import Path


def snapshot(request):
    helper = Path(request['readerHelper'])
    app = helper.parents[2]
    if not helper.is_absolute() or app.suffix != '.app' or helper != app / 'Contents/MacOS/photos-reader':
        raise ValueError('packaged_reader_required')
    data = json.dumps({'command': 'inspect', 'library': request['library'], 'input': request['mutation']}).encode()
    if len(data) > 65536:
        raise ValueError('request_too_large')
    with tempfile.TemporaryDirectory(prefix='photos-reader-preflight-') as directory:
        source, target = Path(directory) / 'input.json', Path(directory) / 'output.json'
        source.touch(mode=0o600); target.touch(mode=0o600)
        source.write_bytes(data)
        child = subprocess.Popen(['/usr/bin/open', '-n', '-g', '-i', str(source), '-o', str(target),
                                  '--stderr', '/dev/null', str(app)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if target.stat().st_size > 12 * 1024 * 1024:
                    raise ValueError('provider_output_limit')
                output = target.read_bytes()
                if output.endswith(b'\n'):
                    result = json.loads(output)
                    if result.get('ok') is not True:
                        raise ValueError('reader_preflight_failed')
                    return result['result']
                if child.poll() not in (None, 0):
                    raise ValueError('reader_preflight_failed')
                time.sleep(.025)
            raise ValueError('provider_timeout')
        finally:
            if child.poll() is None:
                child.terminate()
            child.wait(timeout=5)
