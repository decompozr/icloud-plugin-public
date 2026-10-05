"""Private binary upload stage; never publishes an asset into a Shared Album.

Allocate a destination using the same sealed account, send reviewed staged bytes
once, and return a server-only receipt. Caller must durably claim the stage first.
No arbitrary URL input, redirects, retries, UI, or implicit login.
"""
import hashlib
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import stat
import signal
import sys
from urllib.parse import urlsplit
from uuid import UUID

spec = importlib.util.spec_from_file_location('shared_stream_request', Path(__file__).with_name('shared-stream-request.py'))
protocol = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protocol)
MAX_BYTES = 500 * 1024 * 1024


def upload_url(raw, service_origin):
    if not isinstance(raw, str) or len(raw) > 16384 or re.search(r'[\x00-\x20\x7f]', raw):
        raise ValueError('upload_destination')
    url = urlsplit(raw)
    service = urlsplit(service_origin)
    # Only a URL returned by this account's allocation request enters here.
    # Use parsed host boundaries, never a string prefix. Credentials remain
    # cookie-domain scoped and must not be forwarded as a blanket Cookie header.
    suffixes = ('.icloud.com.cn', '.icloud-content.com.cn') if service.hostname.endswith('.cn') else ('.icloud.com', '.icloud-content.com')
    if (url.scheme != 'https' or url.username or url.password or url.port not in [None, 443]
            or url.fragment or not url.hostname or not url.hostname.endswith(suffixes)
            or not url.query or 'chunker=' in url.query):
        raise ValueError('upload_destination')
    return raw + '&chunker=FIXED'


def run(request, allocate=None, session_factory=None):
    from requests import Session
    from requests.cookies import create_cookie
    album = request['albumGuid']
    if not isinstance(album, str) or str(UUID(album)) != album.lower():
        raise ValueError('identity')
    size, digest = request['bytes'], request['sha256']
    if type(size) is not int or not 0 < size <= MAX_BYTES or not isinstance(digest, str) or not re.fullmatch('[a-f0-9]{64}', digest):
        raise ValueError('source')
    path = request['privatePath']
    if not isinstance(path, str) or not os.path.isabs(path) or os.path.realpath(path) != path:
        raise ValueError('source')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as source:
        before = os.fstat(source.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size != size or before.st_uid != os.getuid() or before.st_mode & 0o077:
            raise ValueError('source')
        hashed = hashlib.sha256()
        hashed_bytes = 0
        while chunk := source.read(1024 * 1024):
            hashed_bytes += len(chunk)
            if hashed_bytes > size: raise ValueError('source_changed')
            hashed.update(chunk)
        checked = os.fstat(source.fileno())
        if hashed_bytes != size or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (checked.st_size, checked.st_mtime_ns, checked.st_ctime_ns) or hashed.hexdigest() != digest:
            raise ValueError('source_changed')
        source.seek(0)
        # The existing actor verifies the saved account, DSID and advertised origin
        # before it dispatches. No caller-provided destination or cookie is accepted.
        allocation = (allocate or protocol.run)({
            **{key:request[key] for key in ['username', 'state', 'dsid', 'serviceOrigin']},
            'endpoint':'webgetuploadurl', 'body':json.dumps({'albumguid':album, 'filesize':size}),
            'transport':'system_http2',
        })
        if allocation['status'] != 200:
            raise ValueError('allocation')
        target = upload_url(json.loads(allocation['body'])['uploadurl'], request['serviceOrigin'])
        session = (session_factory or Session)()
        try:
            session.trust_env = False
            for cookie in request['state']['cookies']:
                domain = cookie['domain'].lstrip('.')
                if domain in ['icloud.com', 'icloud.com.cn'] or domain.endswith(('.icloud.com', '.icloud.com.cn')):
                    session.cookies.set_cookie(create_cookie(**cookie))
            with session.post(target, data=source, headers={'Content-Type':'text/plain',
                    'Origin':'https://www.icloud.com', 'Referer':'https://www.icloud.com/'},
                    timeout=(5, 120), allow_redirects=False, verify=True, stream=True) as response:
                if response.status_code != 200:
                    raise ValueError('upload_response')
                chunks, length = [], 0
                for chunk in response.iter_content(8192):
                    length += len(chunk)
                    if length > 65536: raise ValueError('response_limit')
                    chunks.append(chunk)
                after = os.fstat(source.fileno())
                if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise ValueError('source_changed')
                # TypeScript validates the receipt. Do not persist or log this raw
                # response; it may carry authorization to the uploaded resource.
                return {'body':b''.join(chunks).decode('utf-8')}
        finally:
            session.close()


if __name__ == '__main__':
    def interrupt_actor(_signal, _frame):
        raise InterruptedError()
    signal.signal(signal.SIGTERM, interrupt_actor)
    logging.disable(logging.CRITICAL)
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536: raise ValueError('input_limit')
        print(json.dumps({'ok':True, 'result':run(json.loads(raw))}))
    except Exception:
        # Failure may follow a completed binary upload; never suggest retry.
        print(json.dumps({'ok':False, 'error':'shared_upload_stage_outcome_unknown'}))
