import {test,expect} from 'bun:test';
import {runProcess,runNative} from './provider.js';
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
