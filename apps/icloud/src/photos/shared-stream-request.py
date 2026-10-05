"""One account-bound Shared Streams request using only our sealed login cookies.

No implicit authentication, credential lookup, redirects, retries or photo UI.
Raw responses remain server-side and must pass the TypeScript endpoint schemas.
"""
import json
import logging
import re
import sys
import os
import subprocess
import tempfile
import signal
from urllib.parse import urlsplit, urlencode
from uuid import UUID

ENDPOINTS = {'photosZonesList', 'requestWebAccessState', 'webgetalbumslist', 'webgetalbumview', 'webgetassetcount',
             'createalbum', 'updatealbum', 'deletealbum'}


def config_value(value):
    if '\r' in value or '\n' in value or '\x00' in value:
        raise ValueError('header')
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def http2_read(url, payload, cookie, runner=None, content_type="text/plain;charset=UTF-8", empty_body=False, long_probe=False):
    """One read-only system transport; secrets enter stdin, never argv or logs."""
    with tempfile.TemporaryDirectory(prefix='icloud-photos-http2-') as directory:
        body_path = os.path.join(directory, 'response')
        fd = os.open(body_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        config = '\n'.join([
            'url = ' + config_value(url), 'request = "POST"',
            *([] if empty_body else ['header = ' + config_value('Content-Type: ' + content_type)]),
            'header = "Origin: https://www.icloud.com"',
            'header = "Referer: https://www.icloud.com/"',
            'header = ' + config_value('Cookie: ' + cookie),
            'user-agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15"',
            *([] if empty_body else ['data-binary = ' + config_value(payload)]),
        ]) + '\n'
        completed = (runner or subprocess.run)([
            '/usr/bin/curl', '--disable', '--config', '-', '--http2',
            '--silent', '--compressed', '--proxy', '', '--noproxy', '*',
            '--proto', '=https', '--connect-timeout', '5', '--max-time', '170' if long_probe else '50',
            '--max-filesize', '1048576', '--output', body_path,
            '--write-out', '%{http_code}\n%{http_version}',
        ], input=config.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=175 if long_probe else 55, env={'PATH': '/usr/bin:/bin', 'LANG': 'C'})
        if completed.returncode:
            codes = {28: 'shared_album_read_timeout', 60: 'shared_album_tls_failed',
                     6: 'shared_album_connection_failed', 7: 'shared_album_connection_failed'}
            raise TransportFailure(codes.get(completed.returncode, 'shared_album_transport_failed'))
        status, protocol = completed.stdout.decode('ascii').split('\n')
        if not re.fullmatch(r'[1-5][0-9]{2}', status) or protocol not in ['1.0', '1.1', '2', '3']:
            raise ValueError('response')
        if os.stat(body_path).st_size > 1024 * 1024:
            raise ValueError('response_limit')
        with open(body_path, 'rb') as body:
            return {'status': int(status), 'body': body.read().decode('utf-8'), 'httpVersion': protocol}


class TransportFailure(Exception):
    def __init__(self, code):
        self.code = code


def run(request, session_factory=None, curl_runner=None):
    from requests import Session, Request
    from requests.cookies import create_cookie
    state = request['state']
    username = request['username'].strip().lower()
    if state.get('schemaVersion') != 1 or state.get('username') != username:
        raise ValueError('identity')
    dsid = request['dsid']
    if not isinstance(dsid, str) or not re.fullmatch(r'[0-9]{1,30}', dsid):
        raise ValueError('identity')
    if str(state.get('data', {}).get('dsInfo', {}).get('dsid', '')) != dsid:
        raise ValueError('identity')
    origin = urlsplit(request['serviceOrigin'])
    if (origin.scheme != 'https' or origin.username or origin.password or origin.port not in [None, 443] or
            origin.path not in ['', '/'] or origin.query or origin.fragment or
            not re.fullmatch(r'p[0-9]+-sharedstreams\.icloud\.com(?:\.cn)?', origin.hostname or '')):
        raise ValueError('service')
    # The route must also be advertised by this authenticated account's state.
    advertised = state.get('data', {}).get('webservices', {}).get('sharedstreams', {}).get('url', '')
    if advertised.rstrip('/') != request['serviceOrigin'].rstrip('/'):
        raise ValueError('service')
    endpoint = request['endpoint']
    if endpoint not in ENDPOINTS:
        raise ValueError('endpoint')
    long_probe = request.get('longProbe', False)
    if not isinstance(long_probe, bool) or long_probe and (endpoint != 'webgetalbumslist' or request.get('transport') != 'system_http2' or request.get('body') != '{}'):
        raise ValueError('probe')
    is_read = endpoint.startswith('webget') or endpoint in ['requestWebAccessState', 'photosZonesList']
    transport = request.get('transport', 'requests')
    if transport not in ['requests', 'system_http2'] or transport == 'system_http2' and not is_read:
        raise ValueError('transport')
    payload = request['body']
    if not isinstance(payload, str) or len(payload.encode()) > 8192 or not isinstance(json.loads(payload), dict):
        raise ValueError('payload')
    # Apple may advertise the standard TLS port explicitly. Canonicalize it like
    # URL.origin in TypeScript; nonstandard ports remain forbidden.
    url = f'https://{origin.hostname}/{dsid}/sharedstreams/{endpoint}'
    if endpoint == 'requestWebAccessState':
        suffix = '.cn' if origin.hostname.endswith('.cn') else ''
        url = f'https://setup.icloud.com{suffix}/setup/ws/1/requestWebAccessState'
        if payload != '{}':
            raise ValueError('payload')
    if endpoint == 'photosZonesList':
        cloud = urlsplit(state.get('data', {}).get('webservices', {}).get('ckdatabasews', {}).get('url', ''))
        if (cloud.scheme != 'https' or cloud.username or cloud.password or cloud.port not in [None, 443] or
                cloud.path not in ['', '/'] or cloud.query or cloud.fragment or
                not re.fullmatch(r'p[0-9]+-ckdatabasews\.icloud\.com(?:\.cn)?', cloud.hostname or '')):
            raise ValueError('service')
        if payload != '{}':
            raise ValueError('payload')
        url = f'https://{cloud.hostname}/database/1/com.apple.photos.cloud/production/private/zones/list'
    if is_read:
        # Pinned pyicloud 2.7.0 PhotoStreamLibrary._get_albums includes these
        # service params. Use this authenticated session's client identity;
        # never generate a new ID or accept tool-supplied query parameters.
        client_id = state.get('sessionData', {}).get('client_id')
        if not isinstance(client_id, str) or str(UUID(client_id)) != client_id.lower():
            raise ValueError('identity')
        params = {'clientBuildNumber':'2534Project66', 'clientMasteringNumber':'2534B22', 'clientId':client_id}
        if endpoint != 'requestWebAccessState':
            params['dsid'] = dsid
        if endpoint == 'photosZonesList':
            params.update(remapEnums=True, getCurrentSyncToken=True)
        url += '?' + urlencode(params)
    content_type = 'plain/text' if endpoint in ['webgetalbumslist', 'photosZonesList'] else 'text/plain;charset=UTF-8'
    session = (session_factory or Session)()
    try:
        # Disable netrc/proxy credential discovery. requests' default adapter has
        # max_retries=0; never use PyiCloudSession's authentication/retry wrapper.
        session.trust_env = False
        for cookie in state['cookies']:
            domain = cookie['domain'].lstrip('.')
            if not (domain in ['icloud.com', 'icloud.com.cn', 'apple.com'] or
                    domain.endswith(('.icloud.com', '.icloud.com.cn', '.apple.com'))):
                continue
            session.cookies.set_cookie(create_cookie(**cookie))
        if transport == 'system_http2':
            prepared = session.prepare_request(Request('POST', url))
            return http2_read(url, payload, prepared.headers.get('Cookie', ''), curl_runner, content_type, endpoint == 'requestWebAccessState', long_probe)
        with session.post(url, data=None if endpoint == 'requestWebAccessState' else payload.encode(), headers={
                **({} if endpoint == 'requestWebAccessState' else {'Content-Type': content_type}),
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15',
                'Origin': 'https://www.icloud.com', 'Referer': 'https://www.icloud.com/'},
                allow_redirects=False, verify=True,
                timeout=(5, 50 if is_read else 20), stream=True) as response:
            chunks = []
            size = 0
            for chunk in response.iter_content(8192):
                size += len(chunk)
                if size > 1024 * 1024:
                    raise ValueError('response_limit')
                chunks.append(chunk)
            return {'status': response.status_code,
                    'body': b''.join(chunks).decode('utf-8', errors='strict')}
    finally:
        session.close()


def failure_code(error):
    from requests.exceptions import ConnectTimeout, ReadTimeout, SSLError, ConnectionError
    if isinstance(error, TransportFailure): return error.code
    if isinstance(error, subprocess.TimeoutExpired): return 'shared_album_read_timeout'
    if isinstance(error, ConnectTimeout): return 'shared_album_connection_timeout'
    if isinstance(error, ReadTimeout): return 'shared_album_read_timeout'
    if isinstance(error, SSLError): return 'shared_album_tls_failed'
    if isinstance(error, ConnectionError): return 'shared_album_connection_failed'
    return 'shared_album_transport_failed'


if __name__ == '__main__':
    # Turn actor cancellation into stack unwinding so subprocess.run stops its
    # read-only child and TemporaryDirectory removes private response files.
    def interrupt_actor(_signal, _frame):
        raise InterruptedError()
    signal.signal(signal.SIGTERM, interrupt_actor)
    logging.disable(logging.CRITICAL)
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError('input_limit')
        print(json.dumps({'ok': True, 'result': run(json.loads(raw))}))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': failure_code(error)}))
