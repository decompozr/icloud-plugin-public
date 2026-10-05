import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from requests import Response, Session

spec = importlib.util.spec_from_file_location('shared_stream_request', Path(__file__).with_name('shared-stream-request.py'))
actor = importlib.util.module_from_spec(spec); spec.loader.exec_module(actor)


class TransportTests(unittest.TestCase):
    def request(self):
        return {'username': 'owner@example.test', 'dsid': '123456789', 'serviceOrigin': 'https://p37-sharedstreams.icloud.com', 'endpoint': 'webgetalbumslist', 'body': '{}', 'state': {
            'schemaVersion': 1, 'username': 'owner@example.test',
            'data': {'dsInfo': {'dsid': '123456789'}, 'webservices': {'sharedstreams': {'url': 'https://p37-sharedstreams.icloud.com'}}},
            'cookies': [{'name': 'X-APPLE-WEBAUTH-TOKEN', 'value': 'sealed-fixture-token', 'domain': '.icloud.com', 'path': '/', 'secure': True, 'expires': None}]}}

    def test_actual_requests_transport_is_single_attempt_cookie_only_and_verified_tls(self):
        calls = []; sessions = []
        def factory():
            s = Session(); sessions.append(s); return s
        def send(session, request, **options):
            calls.append((request, options)); r = Response(); r.status_code = 200; r._content = b'{"albums":[]}'; r._content_consumed = True; return r
        with patch.object(Session, 'send', send):
            result = actor.run(self.request(), factory)
        self.assertEqual(result, {'status': 200, 'body': '{"albums":[]}'})
        self.assertEqual(len(calls), 1)
        req, options = calls[0]
        self.assertEqual(req.method, 'POST')
        self.assertEqual(req.url, 'https://p37-sharedstreams.icloud.com/123456789/sharedstreams/webgetalbumslist')
        self.assertIn('sealed-fixture-token', req.headers['Cookie'])
        self.assertNotIn('Authorization', req.headers)
        self.assertFalse(options['allow_redirects']); self.assertTrue(options['verify'])
        self.assertEqual(options['timeout'], (5, 20))
        self.assertFalse(sessions[0].trust_env)
        self.assertEqual(sessions[0].get_adapter(req.url).max_retries.total, 0)

    def test_account_endpoint_and_service_substitution_reject_before_constructing_transport(self):
        for replacement in [{'dsid': '999'}, {'username': 'other@example.test'}, {'serviceOrigin': 'https://p37-sharedstreams.icloud.com.evil.test'}, {'serviceOrigin': 'https://p38-sharedstreams.icloud.com'}, {'endpoint': '../createalbum'}]:
            with self.subTest(replacement=replacement), patch.object(Session, '__init__', side_effect=AssertionError('transport must not be constructed')):
                with self.assertRaises(ValueError): actor.run({**self.request(), **replacement})

    def test_transport_failure_never_retries_or_authenticates(self):
        calls = []
        def fail(session, request, **options): calls.append(request); raise ConnectionError('fixture transport failure')
        request = self.request(); request['endpoint'] = 'createalbum'
        with patch.object(Session, 'send', fail), self.assertRaises(ConnectionError): actor.run(request)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__': unittest.main()
