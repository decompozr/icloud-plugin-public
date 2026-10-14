import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {verifyServiceApp,serviceAppSchema} from './service-app.js';
import {inspectArtifact} from './install.js';
test('service payload rejects wrong Team and code-bearing links outside the App before signing tools',async()=>{
 expect(()=>serviceAppSchema.parse({app:'DecompozR Studio.app',signingTeam:'ABCDEFGHIJ'})).toThrow();
 const root=await mkdtemp(join(tmpdir(),'studio-app-containment-'));
 try{const app=join(root,'DecompozR Studio.app');await mkdir(join(app,'Contents/Resources'),{recursive:true});await Bun.write(join(root,'outside.js'),'fixture');await symlink(join(root,'outside.js'),join(app,'Contents/Resources/outside.js'));
 await expect(verifyServiceApp(root,{app:'DecompozR Studio.app',signingTeam:'74NBML8KJB'})).rejects.toThrow('EXTERNAL_SYMLINK');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('an unsigned prepared App cannot be installed as a legacy artifact',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-app-unsigned-'));
 try{await mkdir(join(root,'apps/studio/dist/server'),{recursive:true});await mkdir(join(root,'DecompozR Studio.app'));
 await Bun.write(join(root,'runtime.sh'),'fixture');await Bun.write(join(root,'apps/studio/dist/server/index.js'),'fixture');await Bun.write(join(root,'artifact.json'),JSON.stringify({format:1,name:'icloud-plugin',version:'0.1.114',platform:process.platform,arch:process.arch,bun:Bun.version}));
 await expect(inspectArtifact(root)).rejects.toThrow('UNSIGNED_SERVICE_APP');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('App root cannot redirect the signed release to an external bundle',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-app-root-link-'));
 try{const artifact=join(root,'artifact'),outside=join(root,'outside/DecompozR Studio.app');await mkdir(artifact);await mkdir(outside,{recursive:true});await symlink(outside,join(artifact,'DecompozR Studio.app'));
 await expect(verifyServiceApp(artifact,{app:'DecompozR Studio.app',signingTeam:'74NBML8KJB'})).rejects.toThrow('ROOT_INVALID');
 }finally{await rm(root,{recursive:true,force:true});}
});
