import {test,expect} from 'bun:test';
import {readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {runReader} from '../../../modules/photos/src/provider.js';
const app=process.env.PHOTOS_READER_FIXTURE_APP;
const scenario=app?test:test.skip;
scenario('sealed dedicated reader accepts its fixture library, rejects other libraries and tampered resources',async()=>{
 const configuration=join(app!,'Contents/Resources/reader-config.json');
 const original=await readFile(configuration,'utf8');
 const {library}=JSON.parse(original) as {library:string};
 // This test is only for a disposable fixture app and an unprotected fixture DB.
 expect(app).toContain('.decompozr/flow/run/photos-reader-fixture');
 expect(library).toContain('.decompozr/flow/run/photos-reader-library.photoslibrary');
 const helper=join(app!,'Contents/MacOS/photos-reader');
 expect(await runReader(helper,{command:'access',library},15000)).toEqual({readable:true});
 await expect(runReader(helper,{command:'access',library:'/tmp/Other.photoslibrary'},15000)).rejects.toThrow('reader_library_mismatch');
 await expect(runReader(helper,{command:'apply',library},15000)).rejects.toThrow('invalid_reader_request');
 try{
  await writeFile(configuration,original+' ');
  await expect(runReader(helper,{command:'access',library},15000)).rejects.toThrow('reader_signature_invalid');
 }finally{await writeFile(configuration,original);}
 expect(await runReader(helper,{command:'access',library},15000)).toEqual({readable:true});
 const database=join(library,'database/Photos.sqlite'),outside=join(dirname(library),'photos-reader-outside-fixture-db');
 const databaseBytes=await readFile(database);
 try{
  await writeFile(outside,databaseBytes);await rm(database);await symlink(outside,database);
  await expect(runReader(helper,{command:'access',library},15000)).rejects.toThrow('invalid_library');
 }finally{await rm(database,{force:true});await writeFile(database,databaseBytes);await rm(outside,{force:true});}
},60000);
scenario('bundled Python skips signed site startup hooks and external import side effects',async()=>{
 expect(app).toContain('.decompozr/flow/run/photos-reader-fixture');
 const hook=join(app!,'Contents/Resources/python/lib/python3.12/site-packages/reader-test-hook.pth');
 expect(await readFile(hook,'utf8')).toContain('photos-reader-outside-hook-marker');
 const marker=join(dirname(dirname(app!)),'photos-reader-outside-hook-marker');
 expect(await Bun.file(marker).exists()).toBe(false);
 const {library}=JSON.parse(await readFile(join(app!,'Contents/Resources/reader-config.json'),'utf8')) as {library:string};
 await expect(runReader(join(app!,'Contents/MacOS/photos-reader'),{command:'health',library},15000)).rejects.toThrow('photos_read_failed');
 expect(await Bun.file(marker).exists()).toBe(false);
},20000);
const stallApp=process.env.PHOTOS_READER_STALL_FIXTURE_APP;
(stallApp?test:test.skip)('reader deadline covers a blocked large stdin write',async()=>{
 expect(stallApp).toContain('.decompozr/flow/run/photos-reader-stall-fixture.app');
 const {library}=JSON.parse(await readFile(join(stallApp!,'Contents/Resources/reader-config.json'),'utf8')) as {library:string};
 expect(library).toContain('.decompozr/flow/run/photos-reader-library.photoslibrary');
 const started=Date.now();
 await expect(runReader(join(stallApp!,'Contents/MacOS/photos-reader'),{command:'health',library,input:{padding:'x'.repeat(60000)}},10000)).rejects.toThrow('provider_timeout');
 expect(Date.now()-started).toBeLessThan(5000);
},15000);
