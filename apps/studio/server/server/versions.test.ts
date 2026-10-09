import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runtimeVersions} from './versions.js';
test('version labels distinguish built source from matching artifact metadata',()=>{
 const dir=mkdtempSync(join(tmpdir(),'icloud-version-')),assets=join(dir,'apps/studio/dist/server/assets');mkdirSync(assets,{recursive:true});try{
 expect(runtimeVersions(assets)).toEqual({});writeFileSync(join(assets,'runtime-version.json'),JSON.stringify({version:'0.1.26'}));expect(runtimeVersions(assets)).toEqual({version:'0.1.26'});
 const metadata={format:1,name:'icloud-plugin',version:'0.1.26',platform:process.platform,arch:process.arch,bun:Bun.version};writeFileSync(join(dir,'artifact.json'),JSON.stringify(metadata));expect(runtimeVersions(assets)).toEqual({version:'0.1.26',installedVersion:'0.1.26'});
 writeFileSync(join(dir,'artifact.json'),JSON.stringify({...metadata,version:'0.1.25'}));expect(runtimeVersions(assets)).toEqual({version:'0.1.26'});
 writeFileSync(join(assets,'runtime-version.json'),'x'.repeat(4097));expect(runtimeVersions(assets)).toEqual({});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
