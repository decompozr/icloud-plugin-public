import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs
import os
from requests import Response, Session

spec = importlib.util.spec_from_file_location('shared_stream_request', Path(__file__).with_name('shared-stream-request.py'))
actor = importlib.util.module_from_spec(spec); spec.loader.exec_module(actor)


class TransportTests(unittest.TestCase):
    def test_http2_read_sends_secrets_only_over_stdin_and_cleans_private_response(self):
        request = self.request(); request['transport'] = 'system_http2'; calls = []; files = []
        def runner(argv, **options):
            calls.append(argv); config = options['input'].decode();
            self.assertNotIn('sealed-fixture-token', ' '.join(argv)); self.assertNotIn('123456789', ' '.join(argv))
            self.assertIn('sealed-fixture-token', config); self.assertIn('/sharedstreams/webgetalbumslist', config)
            self.assertIn('Content-Type: plain/text', config)
            self.assertEqual(argv[:4], ['/usr/bin/curl','--disable','--config','-'])
            self.assertIn('--http2', argv); self.assertNotIn('--insecure', argv); self.assertNotIn('--location', argv)
            self.assertNotIn('--netrc', argv); self.assertEqual(options['timeout'], 55)
            path = argv[argv.index('--output') + 1]; files.append(path)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            Path(path).write_text('{"albums":[]}'); return SimpleNamespace(returncode=0, stdout=b'200\n2')
        result = actor.run(request, curl_runner=runner)
        self.assertEqual(result, {'status':200,'body':'{"albums":[]}','httpVersion':'2'})
        self.assertEqual(len(calls), 1); self.assertFalse(Path(files[0]).exists())

    def test_http2_never_dispatches_writes_and_does_not_retry_failed_reads(self):
        request = self.request(); request.update(transport='system_http2', endpoint='createalbum')
        with self.assertRaises(ValueError): actor.run(request, curl_runner=lambda *a,**k:self.fail('write dispatched'))
        request['endpoint'] = 'webgetalbumslist'; calls = []
        def runner(argv, **options):
            calls.append(argv); return SimpleNamespace(returncode=28, stdout=b'000\n0')
        with self.assertRaises(actor.TransportFailure) as caught: actor.run(request, curl_runner=runner)
        self.assertEqual(actor.failure_code(caught.exception), 'shared_album_read_timeout'); self.assertEqual(len(calls), 1)

    def test_interrupted_http2_read_removes_private_response(self):
        request = self.request(); request['transport'] = 'system_http2'; files = []
        def runner(argv, **options):
            files.append(argv[argv.index('--output') + 1]); raise InterruptedError()
        with self.assertRaises(InterruptedError): actor.run(request, curl_runner=runner)
        self.assertEqual(len(files), 1); self.assertFalse(Path(files[0]).exists())

    def test_web_access_probe_is_fixed_read_only_and_uses_retained_session(self):
        request = self.request(); request['endpoint'] = 'requestWebAccessState'; calls = []
        def send(session, prepared, **options):
            calls.append(prepared)
            self.assertEqual(urlsplit(prepared.url).path, '/setup/ws/1/requestWebAccessState')
            self.assertEqual(urlsplit(prepared.url).hostname, 'setup.icloud.com')
            self.assertNotIn('dsid', parse_qs(urlsplit(prepared.url).query))
            self.assertIsNone(prepared.body)
            self.assertNotIn('Content-Type', prepared.headers)
            self.assertIn('sealed-fixture-token', prepared.headers['Cookie'])
            self.assertFalse(options['allow_redirects']); self.assertTrue(options['verify'])
            r = Response(); r.status_code = 200; r._content = b'{}'; r._content_consumed = True; return r
        with patch.object(Session, 'send', send): actor.run(request)
        self.assertEqual(len(calls), 1)
        for endpoint in ['enableDeviceConsentForPCS', 'requestPCS']:
            request['endpoint'] = endpoint
            with self.assertRaises(ValueError): actor.run(request)
        request['endpoint'] = 'requestWebAccessState'; request['body'] = '{"consent":true}'
        with self.assertRaises(ValueError): actor.run(request)

    def test_web_access_http2_has_no_body_or_content_type(self):
        request = self.request(); request.update(endpoint='requestWebAccessState', transport='system_http2')
        def runner(argv, **options):
            config = options['input'].decode()
            self.assertNotIn('data-binary', config); self.assertNotIn('Content-Type', config)
            self.assertNotIn('dsid=', config); self.assertIn('/setup/ws/1/requestWebAccessState?', config)
            Path(argv[argv.index('--output')+1]).write_text('{}')
            return SimpleNamespace(returncode=0, stdout=b'200\n2')
        self.assertEqual(actor.run(request, curl_runner=runner)['status'], 200)

    def test_photos_probe_uses_only_advertised_cloudkit_and_fixed_read(self):
        request = self.request(); request['endpoint'] = 'photosZonesList'
        request['state']['data']['webservices']['ckdatabasews'] = {'url':'https://p37-ckdatabasews.icloud.com:443'}
        calls = []
        def send(session, prepared, **options):
            calls.append(prepared)
            self.assertEqual(urlsplit(prepared.url).hostname, 'p37-ckdatabasews.icloud.com')
            self.assertEqual(urlsplit(prepared.url).path, '/database/1/com.apple.photos.cloud/production/private/zones/list')
            self.assertEqual(prepared.body, b'{}'); self.assertEqual(prepared.headers['Content-Type'], 'plain/text')
            self.assertFalse(options['allow_redirects'])
            r = Response(); r.status_code = 200; r._content = b'{"zones":[]}'; r._content_consumed = True; return r
        with patch.object(Session, 'send', send): actor.run(request)
        self.assertEqual(len(calls), 1)
        for url in ['https://evil.example', 'http://p37-ckdatabasews.icloud.com', 'https://p37-ckdatabasews.icloud.com/records/modify']:
            request['state']['data']['webservices']['ckdatabasews']['url'] = url
            with patch.object(Session, '__init__', side_effect=AssertionError('no transport')):
                with self.assertRaises(ValueError): actor.run(request)

    def test_failure_diagnostics_expose_only_fixed_categories(self):
        from requests.exceptions import ConnectTimeout, ReadTimeout, SSLError, ConnectionError
        for kind, code in [(ConnectTimeout,'shared_album_connection_timeout'),(ReadTimeout,'shared_album_read_timeout'),(SSLError,'shared_album_tls_failed'),(ConnectionError,'shared_album_connection_failed'),(ValueError,'shared_album_transport_failed')]:
            self.assertEqual(actor.failure_code(kind('secret-token')), code)
    def request(self):
        return {'username': 'owner@example.test', 'dsid': '123456789', 'serviceOrigin': 'https://p37-sharedstreams.icloud.com', 'endpoint': 'webgetalbumslist', 'body': '{}', 'state': {
            'schemaVersion': 1, 'username': 'owner@example.test',
            'sessionData': {'client_id':'11111111-1111-4111-8111-111111111111'},
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
        self.assertEqual(req.headers['Content-Type'], 'plain/text')
        self.assertEqual(urlsplit(req.url)._replace(query='').geturl(), 'https://p37-sharedstreams.icloud.com/123456789/sharedstreams/webgetalbumslist')
        self.assertEqual(parse_qs(urlsplit(req.url).query), {'clientBuildNumber':['2534Project66'],'clientMasteringNumber':['2534B22'],'clientId':['11111111-1111-4111-8111-111111111111'],'dsid':['123456789']})
        self.assertIn('sealed-fixture-token', req.headers['Cookie'])
        self.assertNotIn('Authorization', req.headers)
        self.assertFalse(options['allow_redirects']); self.assertTrue(options['verify'])
        self.assertEqual(options['timeout'], (5, 50))
        self.assertFalse(sessions[0].trust_env)
        self.assertEqual(sessions[0].get_adapter(req.url).max_retries.total, 0)

    def test_account_endpoint_and_service_substitution_reject_before_constructing_transport(self):
        for replacement in [{'dsid': '999'}, {'username': 'other@example.test'}, {'serviceOrigin': 'https://p37-sharedstreams.icloud.com.evil.test'}, {'serviceOrigin': 'https://p38-sharedstreams.icloud.com'}, {'endpoint': '../createalbum'}]:
            with self.subTest(replacement=replacement), patch.object(Session, '__init__', side_effect=AssertionError('transport must not be constructed')):
                with self.assertRaises(ValueError): actor.run({**self.request(), **replacement})

    def test_read_requires_the_retained_authenticated_client_id_before_transport(self):
        for client_id in [None, 'bad-id', 'https://evil.example', 'fixture\nheader']:
            request = self.request(); request['state']['sessionData']['client_id'] = client_id
            with patch.object(Session, '__init__', side_effect=AssertionError('no transport')):
                with self.assertRaises(ValueError): actor.run(request)

    def test_advertised_standard_tls_port_is_canonicalized_and_other_ports_reject(self):
        request = self.request()
        request['serviceOrigin'] += ':443'
        request['state']['data']['webservices']['sharedstreams']['url'] = request['serviceOrigin']
        calls = []
        def send(session, prepared, **options):
            calls.append(prepared.url); r = Response(); r.status_code = 200; r._content = b'{"albums":[]}'; r._content_consumed = True; return r
        with patch.object(Session, 'send', send): actor.run(request)
        self.assertEqual(len(calls), 1)
        self.assertEqual(urlsplit(calls[0])._replace(query='').geturl(), 'https://p37-sharedstreams.icloud.com/123456789/sharedstreams/webgetalbumslist')
        for port in [80, 444, 8443]:
            request['serviceOrigin'] = f'https://p37-sharedstreams.icloud.com:{port}'
            request['state']['data']['webservices']['sharedstreams']['url'] = request['serviceOrigin']
            with patch.object(Session, '__init__', side_effect=AssertionError('no transport')):
                with self.assertRaises(ValueError): actor.run(request)

    def test_transport_failure_never_retries_or_authenticates(self):
        calls = []
        def fail(session, request, **options):
            self.assertEqual(options['timeout'], (5, 20))
            calls.append(request); raise ConnectionError('fixture transport failure')
        request = self.request(); request['endpoint'] = 'createalbum'
        with patch.object(Session, 'send', fail), self.assertRaises(ConnectionError): actor.run(request)
        self.assertEqual(len(calls), 1)


if __name__ == '__main__': unittest.main()
