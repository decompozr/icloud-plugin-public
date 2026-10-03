"""Project-only, verified official Linux Bun binary in existing Alpine image."""
import hashlib, io, json, pathlib, shutil, subprocess, tempfile, time, urllib.request, uuid, zipfile
VERSION = '1.4.2'
SHA256 = '71760b6c8ea30623b81a4907cb815d48e2ea266f2e73e751534a44a0607950df'
URL = f'https://github.com/oven-sh/bun/releases/download/bun-v{VERSION}/bun-linux-aarch64-musl.zip'
def command(*args, check=True):
    result = subprocess.run(['container', *args], capture_output=True, text=True, timeout=40)
    if check and result.returncode: raise RuntimeError(result.stderr or result.stdout)
    return result
images = json.loads(command('image', 'list', '--format', 'json').stdout)
assert any(x['configuration']['name'] == 'docker.io/library/alpine:latest' and x.get('variants') for x in images)
name = 'icloud-bun-' + uuid.uuid4().hex[:12]
root = pathlib.Path(tempfile.mkdtemp(prefix='icloud-linux-bun-fixture-'))
runtime = root / 'runtime'; runtime.mkdir()
state = root / 'state'; state.mkdir()
try:
    with urllib.request.urlopen(URL, timeout=30) as response: archive = response.read()
    assert hashlib.sha256(archive).hexdigest() == SHA256
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        binary = bundle.read('bun-linux-aarch64-musl/bun')
    (runtime / 'bun').write_bytes(binary); (runtime / 'bun').chmod(0o755)
    (runtime / 'worker.ts').write_text("""
const f = Bun.file('/state/counter.json');
const counter = (await f.exists() ? (await f.json()).counter : 0) + 1;
await Bun.write('/state/counter.json', JSON.stringify({ counter }));
const server = Bun.serve({ hostname: '0.0.0.0', port: 8080,
  fetch() { return Response.json({ counter, version: Bun.version, platform: process.platform, arch: process.arch }); }
});
process.on('SIGTERM', async () => {
  await server.stop(true);
  await Bun.write('/state/stopped', String(counter));
  process.exit(0);
});
""")
    command('run', '--detach', '--name', name, '--cpus', '1', '--memory', '256M',
            '--mount', f'type=bind,source={runtime},target=/runtime,readonly',
            '--volume', f'{state}:/state', 'docker.io/library/alpine:latest', '/bin/sh', '-c',
            'apk add --no-cache libstdc++=15.2.0-r5 libgcc=15.2.0-r5 && apk info -v libstdc++ libgcc && exec /runtime/bun /runtime/worker.ts')
    for expected in [1, 2]:
        data = json.loads(command('inspect', name).stdout)[0]
        address = data['status']['networks'][0]['ipv4Address'].split('/')[0]
        url = f'http://{address}:8080/'
        for attempt in range(30):
            try:
                with urllib.request.urlopen(url, timeout=1) as response: value = json.load(response)
                break
            except OSError:
                if attempt == 29:
                    print('Failure logs:', command('logs', name, check=False).stdout, command('logs', name, check=False).stderr, flush=True)
                    raise
                time.sleep(.1)
        assert value == {'counter': expected, 'version': VERSION, 'platform': 'linux', 'arch': 'arm64'}
        print('Verified Linux Bun HTTP:', value, flush=True)
        print('Runtime packages:', command('exec', name, 'apk', 'list', '--installed', 'libstdc++', 'libgcc').stdout, flush=True)
        command('stop', '--time', '3', name)
        assert (state / 'stopped').read_text() == str(expected)
        data = json.loads(command('inspect', name).stdout)[0]
        print('Stopped container state:', data['status']['state'], flush=True)
        assert data['status']['state'] == 'stopped'
        try: urllib.request.urlopen(url, timeout=1)
        except OSError: pass
        else: raise AssertionError('Stopped Bun endpoint still reachable')
        if expected == 1: command('start', name)
    print('SHA256 verified; Linux Bun restart/persistence/SIGTERM passed.', flush=True)
finally:
    if command('inspect', name, check=False).returncode == 0:
        command('stop', '--time', '2', name, check=False)
        command('delete', name)
    shutil.rmtree(root)
    assert command('inspect', name, check=False).returncode != 0
    assert not root.exists()
    print('Owned container, Linux binary and temporary state removed.', flush=True)
