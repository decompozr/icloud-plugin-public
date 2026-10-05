"""One account-bound Shared Streams request using only our sealed login cookies.

No implicit authentication, credential lookup, redirects, retries or photo UI.
Raw responses remain server-side and must pass the TypeScript endpoint schemas.
"""
import json
import logging
import re
import sys
from urllib.parse import urlsplit

ENDPOINTS = {'webgetalbumslist', 'webgetalbumview', 'webgetassetcount',
             'createalbum', 'updatealbum', 'deletealbum'}


def run(request, session_factory=None):
    from requests import Session
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
    payload = request['body']
    if not isinstance(payload, str) or len(payload.encode()) > 8192 or not isinstance(json.loads(payload), dict):
        raise ValueError('payload')
    # Apple may advertise the standard TLS port explicitly. Canonicalize it like
    # URL.origin in TypeScript; nonstandard ports remain forbidden.
    url = f'https://{origin.hostname}/{dsid}/sharedstreams/{endpoint}'
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
        with session.post(url, data=payload.encode(), headers={
                'Content-Type': 'text/plain;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15',
                'Origin': 'https://www.icloud.com', 'Referer': 'https://www.icloud.com/'},
                allow_redirects=False, verify=True, timeout=(5, 20), stream=True) as response:
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
    if isinstance(error, ConnectTimeout): return 'shared_album_connection_timeout'
    if isinstance(error, ReadTimeout): return 'shared_album_read_timeout'
    if isinstance(error, SSLError): return 'shared_album_tls_failed'
    if isinstance(error, ConnectionError): return 'shared_album_connection_failed'
    return 'shared_album_transport_failed'


if __name__ == '__main__':
    logging.disable(logging.CRITICAL)
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError('input_limit')
        print(json.dumps({'ok': True, 'result': run(json.loads(raw))}))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': failure_code(error)}))
