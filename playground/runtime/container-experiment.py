"""Bounded cached-image experiment. No production imports or personal state."""
import json, os, pathlib, shutil, socket, subprocess, tempfile, time, urllib.request, uuid

def command(*args, check=True):
    result = subprocess.run(['container', *args], check=False, capture_output=True, text=True, timeout=40)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result

images = json.loads(command('image', 'list', '--format', 'json').stdout)
image = next((x for x in images if x['configuration']['name'] == 'docker.io/library/alpine:latest'
              and x.get('variants')), None)
if image is None:
    raise SystemExit('BLOCKED: no locally cached Alpine; will not pull an image')
name = 'icloud-runtime-' + uuid.uuid4().hex[:12]
root = pathlib.Path(tempfile.mkdtemp(prefix='icloud-container-fixture-'))
script = '''#!/bin/sh
counter=0
[ ! -f /fixture/counter ] || counter=$(cat /fixture/counter)
counter=$((counter + 1))
printf '%s' "$counter" > /fixture/counter
mkdir -p /fixture/www
printf '%s' "$counter" > /fixture/www/index.html
command -v bun > /fixture/bun-location || true
exec nc -lk -p 8080 -e /fixture/respond.sh
'''
(root / 'start.sh').write_text(script)
(root / 'respond.sh').write_text(r"""#!/bin/sh
while IFS= read -r line; do
  [ "$line" != "$(printf '\r')" ] && [ -n "$line" ] || break
done
printf 'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\n'
cat /fixture/counter
""")
(root / 'respond.sh').chmod(0o755)
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
url = f'http://127.0.0.1:{port}/'

def read():
    with urllib.request.urlopen(url, timeout=1) as response:
        return response.read().decode()

def wait_for(value):
    for _ in range(60):
        try:
            if read() == value:
                return
        except (OSError, TimeoutError) as error:
            last_error = str(error)
        time.sleep(0.1)
    print('Last connection error:', locals().get('last_error'), flush=True)
    print('Container logs:', command('logs', name, check=False).stdout, flush=True)
    raise RuntimeError(f'Loopback endpoint did not return {value}')

def assert_stopped():
    try:
        read()
    except (OSError, TimeoutError):
        return
    raise AssertionError('Stopped endpoint still reachable')

created = False
proxy = None
proxy_url = None
try:
    print('Cached image digest:', image['configuration']['descriptor']['digest'], flush=True)
    # Name comes from the local image inventory and is already fully cached.
    command('run', '--detach', '--name', name, '--cpus', '1', '--memory', '256M',
            '--no-dns', '--publish', f'127.0.0.1:{port}:8080',
            '--volume', f'{root}:/fixture', image['configuration']['name'],
            '/bin/sh', '/fixture/start.sh')
    created = True
    help_result = command('exec', name, 'nc', '--help', check=False)
    print('nc support:', help_result.stdout + help_result.stderr, flush=True)
    inside = command('exec', name, 'wget', '-T', '3', '-qO-', 'http://127.0.0.1:8080/')
    print('Inside wget:', inside.stdout, flush=True)
    assert inside.stdout == '1'
    inspection = json.loads(command('inspect', name).stdout)
    address = inspection[0]['status']['networks'][0]['ipv4Address'].split('/')[0]
    inside_address = command('exec', name, 'wget', '-T', '3', '-qO-', f'http://{address}:8080/')
    assert inside_address.stdout == '1'
    print('Inside container address response:', inside_address.stdout, flush=True)
    try:
        with urllib.request.urlopen(f'http://{address}:8080/', timeout=2) as response:
            print('Host direct container address response:', response.read().decode(), flush=True)
    except OSError as error:
        print('Host direct container address failed:', str(error), flush=True)
    target_file = root / 'proxy-target'
    target_file.write_text(f'http://{address}:8080/')
    proxy = subprocess.Popen([subprocess.check_output(['bun', '-e', 'console.log(process.execPath)'], text=True).strip(), str(pathlib.Path(__file__).with_name('container-proxy.ts')), str(target_file)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env={})
    import select
    assert select.select([proxy.stdout], [], [], 5)[0], 'Bun proxy startup timed out'
    proxy_url = proxy.stdout.readline().strip()
    with urllib.request.urlopen(proxy_url, timeout=3) as response:
        assert response.read().decode() == '1'
    print('Bun loopback proxy before restart: 1', flush=True)
    forwarding_ok = True
    try:
        wait_for('1')
    except RuntimeError:
        forwarding_ok = False
    published = inspection[0]['configuration']['publishedPorts']
    assert published[0]['hostAddress'] == '127.0.0.1'
    print('Host forwarding passed:', forwarding_ok, '; published ports:', json.dumps(published), flush=True)
    command('stop', '--time', '2', name)
    assert_stopped()
    command('start', name)
    inside_restart = command('exec', name, 'wget', '-T', '3', '-qO-', 'http://127.0.0.1:8080/')
    assert inside_restart.stdout == '2'
    restarted = json.loads(command('inspect', name).stdout)
    next_address = restarted[0]['status']['networks'][0]['ipv4Address'].split('/')[0]
    target_file.write_text(f'http://{next_address}:8080/')
    with urllib.request.urlopen(proxy_url, timeout=3) as response:
        assert response.read().decode() == '2'
    print('Bun loopback proxy after rediscovery: 2; IP changed:', address != next_address, flush=True)
    if forwarding_ok:
        wait_for('2')
    command('stop', '--time', '2', name)
    assert_stopped()
    assert (root / 'counter').read_text() == '2'
    print('Inside restart HTTP response: 2; stopped host endpoints unreachable; Bun present:',
          bool((root / 'bun-location').read_text().strip()), flush=True)
finally:
    if proxy is not None:
        proxy.terminate()
        try:
            result = proxy.wait(timeout=5)
            print('Bun proxy exit:', result, flush=True)
        except subprocess.TimeoutExpired:
            proxy.kill(); proxy.wait()
        if proxy_url:
            try:
                urllib.request.urlopen(proxy_url, timeout=1)
            except OSError:
                print('Bun proxy shutdown: clean; listener closed', flush=True)
            else:
                print('ERROR: proxy remains reachable', flush=True)
    # A failed create may still have registered the unique owned name.
    owned = command('inspect', name, check=False)
    if owned.returncode == 0:
        command('stop', '--time', '2', name, check=False)
        command('delete', name)
    shutil.rmtree(root)
    assert command('inspect', name, check=False).returncode != 0
    assert not root.exists()
    print('Owned container and temporary mount removed.', flush=True)

if not forwarding_ok:
    raise SystemExit('PARTIAL: lifecycle passed; localhost published-port forwarding failed')
