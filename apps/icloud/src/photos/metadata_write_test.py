import unittest, importlib.util
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('writer',__file__.replace('metadata_write_test.py','metadata-write.py'))
writer=importlib.util.module_from_spec(spec);spec.loader.exec_module(writer)

class Photo:
    def __init__(self,uuid):
        self.uuid=uuid; self.title='before';self.description='';self.keywords=[];self.favorite=False

class WriteTests(unittest.TestCase):
    def request(self):
        p={'id':'asset:1234567890abcdef:11111111-1111-1111-1111-111111111111','title':'before','description':'','keywords':[],'favorite':False}
        return {'library':'/tmp/test.photoslibrary','mutation':{'values':{'title':'after','favorite':True}},'expected':{'assets':[p]}}
    def test_applied_only_after_readback(self):
        request=self.request();p=Photo('one')
        with patch.object(writer,'read',return_value=request['expected']),patch('osxphotos.utils.get_last_library_path',return_value=request['library']),patch('photoscript.Photo',return_value=p):
            result=writer.run(request)
            self.assertEqual(result['status'],'applied');self.assertEqual(p.title,'after');self.assertTrue(p.favorite)
            self.assertFalse(result['serverSyncVerified'])
    def test_stale_and_wrong_library_never_write(self):
        request=self.request()
        with patch.object(writer,'read',return_value={}),patch('photoscript.Photo') as photo:
            self.assertEqual(writer.run(request)['status'],'stale_plan');photo.assert_not_called()
        with patch.object(writer,'read',return_value=request['expected']),patch('osxphotos.utils.get_last_library_path',return_value='/tmp/other.photoslibrary'),patch('photoscript.Photo') as photo:
            self.assertEqual(writer.run(request)['status'],'wrong_open_library');photo.assert_not_called()
    def test_provider_failure_after_write_is_unknown(self):
        request=self.request()
        class Fault(Photo):
            def __setattr__(self,name,value):
                if name=='favorite' and value is True: raise RuntimeError('secret')
                super().__setattr__(name,value)
        p=Fault('one')
        with patch.object(writer,'read',return_value=request['expected']),patch('osxphotos.utils.get_last_library_path',return_value=request['library']),patch('photoscript.Photo',return_value=p):
            result=writer.run(request);self.assertEqual(result['status'],'outcome_unknown');self.assertEqual(p.title,'after')

if __name__=='__main__': unittest.main()
