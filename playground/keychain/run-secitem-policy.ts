import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {accountPasswordSelector,masterKeySelector,type AccountCustodyIdentity} from '../../apps/icloud/src/storage/custody-contract.js';

// Only compiles and constructs queries. No real Keychain operation or signing setup.
const directory=mkdtempSync(join(tmpdir(),'icloud-secitem-policy-')),binary=join(directory,'policy');
try{
 const compiler=Bun.spawn(['xcrun','swiftc','-warnings-as-errors','-target',(process.arch==='arm64'?'arm64':'x86_64')+'-apple-macosx13.0','-module-cache-path',join(directory,'modules'),'-o',binary,join(import.meta.dir,'SecItemPolicy.swift')],{stdout:'pipe',stderr:'pipe'});
 const [exit,diagnostics]=await Promise.all([compiler.exited,new Response(compiler.stderr).text()]);if(exit!==0||diagnostics)throw Error('query_fixture_compile_failed: '+diagnostics);
 const installationId=randomUUID(),requests:Record<string,unknown>[]=[],expected:string[]=[];
 for(const ownerId of ['synthetic-owner','synthetic/owner','synthetic"\\owner','synthetic照片😀','synthetic\u2028owner']){
  const identity:AccountCustodyIdentity={installationId,ownerId,accountId:randomUUID(),revision:1,generation:2};
  requests.push({...identity,kind:'password',action:'read',interaction:'prohibited'});expected.push(accountPasswordSelector(identity).account);
 }
 for(const action of ['read','add','delete']){requests.push({installationId,kind:'master',action,interaction:action==='add'?'setup':'prohibited'});expected.push(masterKeySelector(installationId).account);}
 const child=Bun.spawn([binary],{stdin:new Blob([JSON.stringify(requests)]),stdout:'pipe',stderr:'pipe'});
 const [code,replies,stderr]=await Promise.all([child.exited,new Response(child.stdout).json() as Promise<{account:string;dataProtection:boolean;synchronizable:boolean;interactionNotAllowed:boolean}[]>,new Response(child.stderr).text()]);
 if(code!==0||stderr||replies.length!==requests.length)throw Error('query_fixture_failed');
 replies.forEach((reply,index)=>{if(reply.account!==expected[index]||!reply.dataProtection||reply.synchronizable||reply.interactionNotAllowed!==(requests[index]!.interaction==='prohibited'))throw Error('query_policy_or_selector_mismatch_at_'+index);});
 process.stdout.write(JSON.stringify({experiment:'modern-secitem-query-policy',cases:requests.length,compiledWithWarningsAsErrors:true,minimumCompileTarget:'macOS13',exactBunSwiftSelectors:true,nonSynchronizing:true,readDeleteInteractionProhibited:true,nativeKeychainCalls:0,provisioningValidated:false,k0Passed:false})+'\n');
}finally{rmSync(directory,{recursive:true,force:true});}
