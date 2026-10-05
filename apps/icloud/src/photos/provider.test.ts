import {test,expect} from 'bun:test';
import {runProcess,runNative} from './provider.js';
import {cleanupCandidateSchema} from './contracts.js';
test('cleanup coverage metadata is bounded and complete for duplicate review parts only',()=>{
 const assetIds=[1,2].map(i=>`asset:1234567890abcdef:${String(i).padStart(8,'0')}-1111-1111-1111-111111111111`);
 const candidate={reason:'same_fingerprint' as const,assetIds,groupAssetCount:1001,groupPart:2,groupParts:2};
 expect(cleanupCandidateSchema.parse(candidate)).toEqual(candidate);
 for(const changed of [{groupParts:1},{groupAssetCount:1},{groupParts:undefined},{reason:'screenshot'},{assetIds:[assetIds[0]]}])expect(cleanupCandidateSchema.safeParse({...candidate,...changed}).success).toBe(false);
 expect(cleanupCandidateSchema.safeParse({reason:'screenshot',assetIds:[assetIds[0]]}).success).toBe(true);
});
test('native transport rejects unbundled helpers and oversized requests before launching',async()=>{
 await expect(runNative('/tmp/photos-helper',{command:'health'})).rejects.toThrow('packaged_helper_required');
 await expect(runNative('/tmp/Photos.app/Contents/MacOS/photos-helper',{data:'x'.repeat(65537)})).rejects.toThrow('request_too_large');
});
test('process adapter validates envelope and suppresses raw provider diagnostics',async()=>{
 expect(await runProcess([process.execPath,'-e','console.log(JSON.stringify({ok:true,result:{value:1}}))'],{})).toEqual({value:1});
 await expect(runProcess([process.execPath,'-e','console.log("secret provider output")'],{})).rejects.toThrow('invalid_provider_response');
 await expect(runProcess([process.execPath,'-e','console.log(JSON.stringify({ok:false,error:"private data in an error"}))'],{})).rejects.toThrow('invalid_provider_response');
});
test('process adapter times out without an automatic retry',async()=>{
 await expect(runProcess([process.execPath,'-e','setTimeout(()=>{},5000)'],{},20)).rejects.toThrow('provider_timeout');
});
test('cancelled transport signals cannot start or continue a request actor',async()=>{
 await expect(runProcess(['/does-not-exist'],{},1000,AbortSignal.abort())).rejects.toThrow('provider_timeout');
 const controller=new AbortController();const request=runProcess([process.execPath,'-e','setTimeout(()=>{},5000)'],{},1000,controller.signal);controller.abort();
 await expect(request).rejects.toThrow();
});
