import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stageUploadSource,releaseUploadSource} from './upload-source.js';

test('review staging privately copies exact bytes without changing the library source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'photos-stage-test-'));try{
  const library=join(root,'Test.photoslibrary'),directory=join(root,'private-staging');await mkdir(library);
  const path=join(library,'original.jpg'),data=Buffer.from('fixture source bytes');await writeFile(path,data);
  const source={assetId:'asset:fixture',path,filename:'original.jpg',representation:'original',livePhotoStillOnly:false,mediaType:'photo'};
  const staged=await stageUploadSource(source,{library,directory,assetId:source.assetId});
  expect(staged.sha256).toBe(createHash('sha256').update(data).digest('hex'));expect(staged.bytes).toBe(data.length);
  expect(await readFile(staged.privatePath)).toEqual(data);expect(await readFile(path)).toEqual(data);
  expect((await stat(staged.privatePath)).mode&0o777).toBe(0o600);
  expect((await stat(join(staged.privatePath,'..'))).mode&0o777).toBe(0o700);
  await expect(releaseUploadSource({...staged,privatePath:path},directory)).rejects.toThrow('upload_cleanup_path_invalid');
  await releaseUploadSource(staged,directory);await expect(stat(staged.privatePath)).rejects.toThrow();expect(await readFile(path)).toEqual(data);
  await expect(stageUploadSource(source,{library,directory,assetId:'different'})).rejects.toThrow('upload_source_identity_mismatch');
  const external=join(root,'external.jpg');await writeFile(external,'external');const link=join(library,'link.jpg');await symlink(external,link);
  await expect(stageUploadSource({...source,path:link},{library,directory,assetId:source.assetId})).rejects.toThrow('upload_source_outside_library');
 }finally{await rm(root,{recursive:true,force:true});}
});
