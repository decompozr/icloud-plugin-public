import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from requests import Session, Request

spec=importlib.util.spec_from_file_location('upload',Path(__file__).with_name('shared-stream-upload.py'))
upload=importlib.util.module_from_spec(spec);spec.loader.exec_module(upload)

class UploadTests(unittest.TestCase):
    def test_destination_host_boundaries_and_region(self):
        origin='https://p37-sharedstreams.icloud.com'
        self.assertEqual(upload.upload_url('https://p37-upload.icloud.com/file?token=fixture',origin),'https://p37-upload.icloud.com/file?token=fixture&chunker=FIXED')
        for url in ['http://p37-upload.icloud.com/a?t=x','https://icloud.com.attacker.test/a?t=x','https://attackericloud.com/a?t=x','https://p37-upload.icloud.com@attacker.test/a?t=x','https://p37-upload.icloud.com:444/a?t=x','https://p37-upload.icloud.com/a?t=x#fragment','https://p37-upload.icloud.com/a','https://p37-upload.icloud.com/a?chunker=OTHER','https://p37-upload.icloud.com.cn/a?t=x']:
            with self.subTest(url=url),self.assertRaises(ValueError):upload.upload_url(url,origin)

    def test_verified_staged_bytes_are_sent_once_with_domain_scoped_cookies(self):
        for lost in [False,True]:
            with tempfile.TemporaryDirectory() as directory:
                path=Path(directory).resolve()/'content';path.write_bytes(b'fixture');path.chmod(0o600)
                calls=[];outer=self
                class FakeSession(Session):
                    def post(self,url,**options):
                        calls.append(url)
                        outer.assertFalse(self.trust_env);outer.assertFalse(options['allow_redirects']);outer.assertTrue(options['verify'])
                        outer.assertEqual(options['data'].read(),b'fixture')
                        # iCloud cookies must not leak to the separate content domain.
                        prepared=self.prepare_request(Request('POST',url))
                        outer.assertNotIn('Cookie',prepared.headers)
                        if lost:raise TimeoutError('private response lost')
                        class Response:
                            status_code=200
                            def __enter__(self):return self
                            def __exit__(self,*args):pass
                            def iter_content(self,size):yield b'{"singleFile":{"fixture":true}}'
                        return Response()
                request={'albumGuid':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bytes':7,'sha256':hashlib.sha256(b'fixture').hexdigest(),'privatePath':str(path),'username':'fixture@example.test','state':{'cookies':[{'name':'session','value':'private','domain':'.icloud.com','path':'/','secure':True}]},'dsid':'123','serviceOrigin':'https://p37-sharedstreams.icloud.com'}
                allocations=[]
                def allocate(value):
                    allocations.append(value);outer.assertEqual(value['endpoint'],'webgetuploadurl');outer.assertEqual(json.loads(value['body']),{'albumguid':request['albumGuid'],'filesize':7})
                    return {'status':200,'body':'{"uploadurl":"https://cvws-h2.icloud-content.com/upload?token=fixture"}'}
                if lost:
                    with self.assertRaises(TimeoutError):upload.run(request,allocate,FakeSession)
                else:self.assertIn('singleFile',upload.run(request,allocate,FakeSession)['body'])
                self.assertEqual(len(calls),1);self.assertEqual(len(allocations),1)
                request['sha256']='0'*64
                with self.assertRaises(ValueError):upload.run(request,lambda _:self.fail('changed source allocated'),FakeSession)
                path.chmod(0o644)
                with self.assertRaises(ValueError):upload.run(request,lambda _:self.fail('public file allocated'),FakeSession)
