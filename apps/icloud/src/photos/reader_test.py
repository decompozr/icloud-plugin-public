import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime, timezone
import reader

class ReaderTests(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(reader.normalize(' Example  Chu '),reader.normalize('example chu'))
        self.assertEqual(reader.normalize('Ｓａｍｐｌｅ'), 'sample')

    def test_query_and_shared_scope(self):
        with TemporaryDirectory() as directory:
            library=Path(directory)/'Test.photoslibrary'; (library/'database').mkdir(parents=True)
            (library/'database/Photos.sqlite').write_bytes(b'fixture')
            p=SimpleNamespace(uuid='11111111-1111-1111-1111-111111111111',date=datetime(2026,9,1,tzinfo=timezone.utc),original_filename='IMG_0001.HEIC',filename='IMG_0001.HEIC',ismovie=False,title='',description='',keywords=[],favorite=False,persons=['Example  Chu'],width=100,height=100,shared=False)
            a=SimpleNamespace(uuid='22222222-2222-2222-2222-222222222222',title='Family Photos',photos=[p])
            db=SimpleNamespace(album_info=[],album_info_shared=[a],persons=['Example  Chu'],persons_as_dict={'Example  Chu':1},photos=lambda:[p])
            with patch('osxphotos.PhotosDB',return_value=db),patch('reader.version',return_value='0.77.2'):
                def run(command,data): return reader.main({'library':str(library),'command':command,'input':data})
                result=run('query',{'person':'example chu','from':'2026-09-01T00:00:00+00:00','to':'2026-10-01T00:00:00+00:00'})
                self.assertEqual(result['total'],1)
                self.assertEqual(run('query',{'to':'2026-09-01T00:00:00+00:00'})['total'],0)
                shared=run('albums',{})['albums'][0]
                self.assertIn(':shared:',shared['id'])
                self.assertEqual(run('compare',{'assetIds':[result['assets'][0]['id']],'albumId':shared['id']})['results'][0]['status'],'confirmed')
                db.persons.append('Example Other')
                self.assertEqual(run('query',{'person':'Example'})['status'],'person_selection_required')
                with self.assertRaises(ValueError): run('detail',{'assetId':'asset:0000000000000000:'+p.uuid})

if __name__=='__main__': unittest.main()
