"""Private authentication actor. No photo operations, browser cookies or Keychain.

Session material is returned only to server-side encrypted custody, never MCP.
The Apple password and user-supplied verification code are never serialized.
"""
import json
import logging
import os
import sys
import tempfile
from dataclasses import fields, is_dataclass, asdict
from importlib.metadata import version
from pathlib import Path


def dependency_ready():
    try:
        if sys.version_info[:2] != (3, 12) or version('pyicloud') != '2.7.0' or version('rich') != '15.0.0':
            return False
        # Distribution metadata alone does not prove the provider can load.
        from pyicloud import PyiCloudService
        return callable(PyiCloudService)
    except Exception:
        return False


def without_transient_secrets(value):
    if isinstance(value, dict):
        return {k: without_transient_secrets(v) for k, v in value.items()
                if str(k).replace('_', '').lower() not in
                ['password', 'passwordraw', 'apppassword', 'verificationcode', 'securitycode']}
    if isinstance(value, (list, tuple)):
        return [without_transient_secrets(v) for v in value]
    return value


def serialize(client, username):
    cookies = []
    for cookie in client.session.cookies:
        cookies.append({key: getattr(cookie, key) for key in
                        ['name', 'value', 'domain', 'path', 'secure', 'expires']})
    bridge = getattr(client, '_trusted_device_bridge_state', None)
    boot = getattr(client, '_hsa2_boot_context', None)
    # Never pickle executable objects or a live socket. Bridge metadata is sealed
    # for the short-lived owner challenge; the actor closes its own connection.
    bridge_data = ({f.name: getattr(bridge, f.name) for f in fields(bridge)
                    if f.name != 'websocket'} if is_dataclass(bridge) else None)
    result = {'schemaVersion': 1, 'username': username,
              'sessionData': dict(client.session.data), 'cookies': cookies,
              'data': client.data, 'authData': getattr(client, '_auth_data', {}),
              'boot': asdict(boot) if is_dataclass(boot) else None,
              'bridge': bridge_data,
              'delivery': getattr(client, '_two_factor_delivery_method', 'unknown')}
    encoded = json.dumps(without_transient_secrets(result))
    if len(encoded.encode()) > 60000:
        raise ValueError('session_limit')
    return json.loads(encoded)


def restore(client, state, username):
    if state.get('schemaVersion') != 1 or state.get('username') != username:
        raise ValueError('session_identity')
    from requests.cookies import create_cookie
    client.session.data.update(state['sessionData'])
    # The constructor reads client_id from its session file before building
    # OAuth headers/params. Our sealed state is restored after construction.
    client_id = state['sessionData'].get('client_id')
    if client_id:
        client._client_id = client_id
        client.params['clientId'] = client_id
    for cookie in state['cookies']:
        client.session.cookies.set_cookie(create_cookie(**cookie))
    client.data = state['data']
    client._auth_data = state['authData']
    client._two_factor_delivery_method = state.get('delivery', 'unknown')
    if state.get('boot') or state.get('bridge'):
        from pyicloud.hsa2_bridge import Hsa2BootContext, TrustedDeviceBridgeState
        if state.get('boot'):
            client._hsa2_boot_context = Hsa2BootContext(**state['boot'])
        if state.get('bridge'):
            client._trusted_device_bridge_state = TrustedDeviceBridgeState(
                websocket=None, **state['bridge'])
    client._update_state()


def run(request, factory=None):
    action = request.get('action')
    if action == 'check':
        return {'dependencyReady': dependency_ready()}
    if action not in ['login', 'verify', 'send_code', 'recheck']:
        raise ValueError('invalid_action')
    username = request['username'].strip().lower()
    if not username or len(username) > 320:
        raise ValueError('invalid_username')
    if factory is None:
        if not dependency_ready():
            raise ValueError('cloud_dependency_missing')
        from pyicloud import PyiCloudService
        factory = PyiCloudService
    # An explicit private directory suppresses library default paths. authenticate
    # false prevents implicit Keychain lookup before we restore our own state.
    old_mask = os.umask(0o077)
    try:
        with tempfile.TemporaryDirectory(prefix='icloud-photos-auth-') as directory:
            os.chmod(directory, 0o700)
            client = factory(username, password=request.get('password') if action == 'login' else None,
                             cookie_directory=directory, authenticate=False,
                             verify=True, accept_terms=False, refresh_interval=None)
            try:
                if action != 'login':
                    restore(client, request['state'], username)
                if action in ['login', 'recheck']:
                    try:
                        client.authenticate()
                    except Exception as error:
                        # In the pinned provider this exact failure means token
                        # reuse failed and a new password is required. Transport
                        # failures remain errors and do not erase saved custody.
                        from pyicloud.exceptions import PyiCloudFailedLoginException
                        if action == 'recheck' and isinstance(error, PyiCloudFailedLoginException) and str(error) == 'No password set':
                            return {'phase': 'authentication_required'}
                        raise
                elif action == 'verify':
                    code = request['code']
                    if not isinstance(code, str) or len(code) != 6 or not code.isascii() or not code.isdigit():
                        raise ValueError('invalid_code')
                    if not client.validate_2fa_code(code):
                        return {'phase': 'verification_failed', 'privateState': serialize(client, username)}
                elif not client.request_2fa_code():
                    return {'phase': 'delivery_failed', 'privateState': serialize(client, username)}
                if client.requires_2sa and not client.requires_2fa:
                    return {'phase': 'unsupported_authentication'}
                pending = bool(client.requires_2fa)
                if not pending and not client.is_trusted_session:
                    return {'phase': 'authentication_required'}
                state = serialize(client, username)
                data = getattr(client, 'data', {})
                service = data.get('webservices', {}).get('sharedstreams', {}).get('url')
                return {'phase': 'awaiting_2fa' if pending else 'authenticated',
                        'privateState': state,
                        'sharedServiceAdvertised': bool(service),
                        'dsid': str(data.get('dsInfo', {}).get('dsid', '')),
                        'serviceOrigin': service}
            finally:
                clear = getattr(client, '_clear_trusted_device_bridge_state', None)
                if clear:
                    clear()
                client.session.close()
    finally:
        os.umask(old_mask)


if __name__ == '__main__':
    logging.disable(logging.CRITICAL)
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError('input_limit')
        result = run(json.loads(raw))
        print(json.dumps({'ok': True, 'result': result}))
    except Exception:
        print(json.dumps({'ok': False, 'error': 'cloud_authentication_failed'}))
