import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cloud_session', Path(__file__).with_name('cloud-session.py'))
actor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(actor)


class CookieJar(list):
    def set_cookie(self, cookie):
        self.append(cookie)


class Session:
    def __init__(self):
        self.data = {'session_token': 'private-session-fixture', 'client_id': 'retained-client-id'}
        self.cookies = CookieJar()
        self.closed = False

    def close(self):
        self.closed = True


class Client:
    def __init__(self, username, **options):
        self.username = username
        self.options = options
        self.session = Session()
        self.data = {'dsInfo': {'dsid': '123456789'}, 'webservices': {}}
        self._auth_data = {'password': 'do-not-persist', 'securityCode': 'do-not-persist-code'}
        self.requires_2fa = False
        self.requires_2sa = False
        self.is_trusted_session = True
        self.directory = options['cookie_directory']
        self.authenticated = False
        self.params = {'clientId': 'new-client-id'}
        self.verified = False

    def authenticate(self):
        self.authenticated = True

    def _update_state(self):
        pass

    def validate_2fa_code(self, code):
        self.verified = True
        return True

    def request_2fa_code(self):
        return True


class CloudSessionTests(unittest.TestCase):
    @unittest.skipUnless(actor.dependency_ready(), 'requires isolated pinned auth environment')
    def test_pinned_provider_roundtrip_has_no_network_or_keychain_and_retains_client_identity(self):
        from pyicloud import PyiCloudService
        from pyicloud.hsa2_bridge import Hsa2BootContext, TrustedDeviceBridgeState
        import tempfile
        with patch('requests.sessions.Session.request', side_effect=AssertionError('network prohibited')), patch('pyicloud.base.get_password_from_keyring', side_effect=AssertionError('keychain prohibited')):
            with tempfile.TemporaryDirectory() as directory:
                first = PyiCloudService('owner@example.test', cookie_directory=directory, authenticate=False, verify=True)
                first._hsa2_boot_context = Hsa2BootContext(has_trusted_devices=True)
                first._trusted_device_bridge_state = TrustedDeviceBridgeState(connection_path='/fixture', push_token='fixture', session_uuid='fixture', websocket=None, topic='fixture', topics_by_hash={})
                state = actor.serialize(first, 'owner@example.test')
                first.session.close()
            with tempfile.TemporaryDirectory() as directory:
                second = PyiCloudService('owner@example.test', cookie_directory=directory, authenticate=False, verify=True)
                actor.restore(second, state, 'owner@example.test')
                self.assertEqual(second._client_id, state['sessionData']['client_id'])
                self.assertEqual(second.params['clientId'], second._client_id)
                self.assertTrue(second._hsa2_boot_context.has_trusted_devices)
                self.assertIsNone(second._trusted_device_bridge_state.websocket)
                second._clear_trusted_device_bridge_state()
                second.session.close()

    @unittest.skipUnless(actor.dependency_ready(), 'requires isolated pinned auth environment')
    def test_expired_session_requires_login_but_transport_failure_retains_error(self):
        from pyicloud.exceptions import PyiCloudFailedLoginException
        state = actor.run({'action': 'login', 'username': 'owner@example.test', 'password': 'transient'}, Client)['privateState']
        def expired(username, **options):
            c = Client(username, **options)
            def fail():
                raise PyiCloudFailedLoginException('No password set')
            c.authenticate = fail
            return c
        result = actor.run({'action': 'recheck', 'username': 'owner@example.test', 'state': state}, expired)
        self.assertEqual(result, {'phase': 'authentication_required'})
        def offline(username, **options):
            c = Client(username, **options)
            def fail():
                raise ConnectionError('fixture offline')
            c.authenticate = fail
            return c
        with self.assertRaises(ConnectionError):
            actor.run({'action': 'recheck', 'username': 'owner@example.test', 'state': state}, offline)

    def test_login_uses_verified_tls_explicit_directory_and_no_implicit_auth_or_keychain(self):
        clients = []
        def factory(username, **options):
            self.assertFalse(options['authenticate'])
            self.assertTrue(options['verify'])
            self.assertFalse(options['accept_terms'])
            self.assertEqual(os.stat(options['cookie_directory']).st_mode & 0o777, 0o700)
            c = Client(username, **options); clients.append(c); return c
        result = actor.run({'action': 'login', 'username': 'Owner@Example.test', 'password': 'input-password-fixture'}, factory)
        self.assertEqual(result['phase'], 'authenticated')
        self.assertTrue(clients[0].authenticated)
        self.assertTrue(clients[0].session.closed)
        self.assertFalse(Path(clients[0].directory).exists())
        self.assertNotIn('input-password-fixture', json.dumps(result))
        self.assertNotIn('do-not-persist', json.dumps(result))

    def test_pending_challenge_restores_without_password_and_verifies_explicit_code(self):
        def pending(username, **options):
            c = Client(username, **options); c.requires_2fa = True; c.is_trusted_session = False; return c
        opened = actor.run({'action': 'login', 'username': 'owner@example.test', 'password': 'transient'}, pending)
        self.assertEqual(opened['phase'], 'awaiting_2fa')
        clients = []
        def verify(username, **options):
            self.assertIsNone(options['password']); c = Client(username, **options); clients.append(c); return c
        result = actor.run({'action': 'verify', 'username': 'owner@example.test', 'code': '654321', 'state': opened['privateState']}, verify)
        self.assertEqual(result['phase'], 'authenticated')
        self.assertTrue(clients[0].verified)
        self.assertEqual(clients[0]._client_id, 'retained-client-id')
        self.assertEqual(clients[0].params['clientId'], 'retained-client-id')
        self.assertNotIn('654321', json.dumps(result))

    def test_wrong_identity_or_malformed_code_rejects_before_validation(self):
        state = actor.run({'action': 'login', 'username': 'owner@example.test', 'password': 'transient'}, Client)['privateState']
        with self.assertRaises(ValueError):
            actor.run({'action': 'verify', 'username': 'other@example.test', 'code': '123456', 'state': state}, Client)
        with self.assertRaises(ValueError):
            actor.run({'action': 'verify', 'username': 'owner@example.test', 'code': 'abcdef', 'state': state}, Client)

    def test_wrong_code_keeps_updated_challenge_tokens_without_code_persistence(self):
        state = actor.run({'action': 'login', 'username': 'owner@example.test', 'password': 'transient'}, Client)['privateState']
        def factory(username, **options):
            c = Client(username, **options)
            def reject(code):
                c.session.data['scnt'] = 'changed-challenge-token'; return False
            c.validate_2fa_code = reject; return c
        result = actor.run({'action': 'verify', 'username': 'owner@example.test', 'code': '987654', 'state': state}, factory)
        self.assertEqual(result['phase'], 'verification_failed')
        self.assertEqual(result['privateState']['sessionData']['scnt'], 'changed-challenge-token')
        self.assertNotIn('987654', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
