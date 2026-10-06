import importlib.util
import hashlib
from pathlib import Path
import struct
import tempfile
import unittest
import zlib
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('shared-test-fixture.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)

class FixtureTests(unittest.TestCase):
    def test_explicit_synthetic_fixture_is_private_and_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            request={'directory':directory,'operationId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
            result=fixture.run(request);path=Path(result['privatePath']);data=path.read_bytes()
            self.assertEqual(result['sha256'],hashlib.sha256(data).hexdigest());self.assertEqual(result['bytes'],len(data))
            self.assertEqual(path.stat().st_mode&0o777,0o600);self.assertEqual(path.parent.stat().st_mode&0o777,0o700)
            self.assertEqual(data,fixture.png(request['operationId']));self.assertIn(b'Photos capability test; synthetic fixture',data)
            self.assertEqual(data[:8],b'\x89PNG\r\n\x1a\n');offset=8;pixels=None
            while offset<len(data):
                size=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];payload=data[offset+8:offset+8+size]
                self.assertEqual(struct.unpack('>I',data[offset+8+size:offset+12+size])[0],zlib.crc32(kind+payload)&0xffffffff)
                if kind==b'IDAT':pixels=zlib.decompress(payload)
                offset+=size+12
            self.assertEqual(len(pixels),200*(640*3+1));self.assertIn(b'\x10\x20\x50',pixels)
            with self.assertRaises(ValueError):fixture.run({**request,'operationId':'not-an-operation'})
