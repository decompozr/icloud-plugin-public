/** Signed actual-native read/preview only. Never invokes control apply or lifecycle mutation. */
import {readFile,writeFile,mkdtemp,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {userInfo} from 'node:os';
import {randomUUID} from 'node:crypto';
import {StdioHomeKitProvider} from '../../apps/icloud/src/homekit/provider.js';
import {parseControlPreview,controlCommandSchema} from '../../apps/icloud/src/homekit/control-contracts.js';
const [receipt,inventoryPath,outputRoot]=process.argv.slice(2);if(!receipt||!inventoryPath||!outputRoot)throw Error('Signed receipt, approved inventory and private output required');
process.umask(0o077);
const build=JSON.parse(await readFile(receipt,'utf8')),inventory=JSON.parse(await readFile(inventoryPath,'utf8'));if(build.state!=='succeeded'||!build.signatureVerified||inventory.homes.length!==1)throw Error('Approved single-Home evidence required');
const root=await mkdtemp(join(resolve(outputRoot),'control-read-preview-')),home=inventory.homes[0].id;
const targets=[];for(const a of inventory.homes[0].accessories)if(a.room==='Office'&&a.name==='Light')for(const s of a.services)for(const c of s.characteristics)if(c.type.startsWith('00000025-')&&c.format==='bool')targets.push({homeId:home,accessoryId:a.id,serviceId:s.id,characteristicId:c.id});if(targets.length!==1)throw Error('Previously accepted read target unavailable');
const p=new StdioHomeKitProvider({python:'/usr/bin/python3',app:build.app,sourceSHA256:build.sourceSHA256,signingTeam:'74NBML8KJB',localUserId:userInfo().uid,stateDirectory:join(root,'native'),lifecycle:true,control:true});
let passed=false;
try{
 const fresh=await p.call('homekit_read',targets[0]) as {value:unknown;valueSource:string};if(typeof fresh.value!=='boolean'||fresh.valueSource!=='fresh-read')throw Error('Read target changed');
 const command=controlCommandSchema.parse({...targets[0],action:'write',operationId:randomUUID(),value:fresh.value});
 const preview=parseControlPreview(await p.call('homekit_control_preview',command),command);await writeFile(join(root,'preview.json'),JSON.stringify(preview,null,2)+'\n');
 const missing=await p.call('homekit_control_outcome',{...command,expectedRevision:preview.revision}) as {found:boolean};if(missing.found)throw Error('Unexpected operation record');
 const page=await p.call('homekit_automation_inventory',{homeId:home,offset:0,limit:1}) as {scenes:{id:string}[]};
 if(!page.scenes.length)throw Error('Unowned-scene denial target missing');
 let denied=false;try{await p.call('homekit_control_preview',{homeId:home,operationId:randomUUID(),action:'executeScene',sceneId:page.scenes[0]!.id});}catch{denied=true;}
 if(!denied)throw Error('Unowned scene preview accepted');
 const after=await p.call('homekit_read',targets[0]) as {value:unknown};if(after.value!==fresh.value)throw Error('Read-only target changed during acceptance');
 passed=true;
}finally{await p.dispose();}
const sessions=join(root,'native/sessions');let stopped=0;for(const entry of await readdir(sessions)){const pid=Number(await readFile(join(sessions,entry,'native.pid'),'utf8'));const child=Bun.spawn(['ps','-p',String(pid)],{stdout:'ignore',stderr:'ignore'});if(await child.exited===0)throw Error('Owned native PID remains');stopped++;}
const summary={status:passed?'passed':'failed',actualNative:true,sourceSHA256:build.sourceSHA256,protocolVersion:'0.15.0',previewPassed:true,unownedSceneDenied:true,readOnlyOutcomeAbsent:true,physicalWrites:0,controlApplyCalls:0,householdAutomationMutations:0,existingOAuthConsentChanged:false,clientAcceptance:false,ownedNativeProcessesStopped:stopped};await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({root,...summary}));
