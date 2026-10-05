import {expect,test} from 'bun:test';
import {EventEmitter} from 'node:events';
import {hiddenPrompt} from './cloud-cli';
function terminal(){
  const input=Object.assign(new EventEmitter(),{isTTY:true,isRaw:false,setRawMode(raw:boolean){this.isRaw=raw;return this;},resume(){return this;},pause(){return this;}});
  let text=''; const output={isTTY:true,write(chunk:string){text+=chunk;}};
  const signals=new EventEmitter();
  const prompt=()=>hiddenPrompt('Secret: ',input as any,output as any,signals);
  return {input,output,signals,prompt,text:()=>text};
}
test('hidden prompt restores terminal on EOF/error/close and signals', async()=>{
  for(const event of ['end','close','error','SIGINT','SIGTERM','SIGHUP']){
    const t=terminal(); const result=t.prompt();
    expect(t.input.isRaw).toBe(true);
    (event.startsWith('SIG')?t.signals:t.input).emit(event);
    await expect(result).rejects.toThrow('cancelled');
    expect(t.input.isRaw).toBe(false); expect(t.input.listenerCount('data')).toBe(0);
    expect(t.signals.listenerCount('SIGTERM')).toBe(0);
  }
});
test('hidden prompt preserves split UTF8 and deletes whole Unicode characters',async()=>{
  const t=terminal(); const result=t.prompt(); const bytes=Buffer.from('密碼😱');
  for(const byte of bytes)t.input.emit('data',Buffer.from([byte]));
  t.input.emit('data',Buffer.from('\x7f!\r'));
  expect(await result).toBe('密碼!');expect(t.text()).toBe('Secret: \n'); expect(t.input.isRaw).toBe(false);
});
test('hidden prompt settles even when disconnected terminal restoration throws',async()=>{
  const t=terminal(); const result=t.prompt();
  let paused=false;
  t.input.pause=()=>{paused=true;return t.input;};
  t.input.setRawMode=()=>{throw new Error('disconnected');};
  t.input.emit('close');
  await expect(result).rejects.toThrow('Terminal restoration failed');
  expect(paused).toBe(true);
  expect(t.input.listenerCount('data')).toBe(0);
});
test('album disclosure flag is explicit and only valid for album listing', async()=>{
 const {cloudCommand}=await import('./cloud-cli');
 expect(cloudCommand(['--people-schema'])).toEqual({mode:'--people-schema',showAlbums:false});
 expect(()=>cloudCommand(['--people-schema','--show-albums'])).toThrow();
 expect(cloudCommand(['--albums']).showAlbums).toBe(false);
 expect(cloudCommand(['--albums','--show-albums']).showAlbums).toBe(true);
 for(const args of [['--read','--show-albums'],['--album-id','secret-id'],['--show-albums'],['--albums','other']])expect(()=>cloudCommand(args)).toThrow();
});

test('CLI catch emits only safe stage/reason/status, never arbitrary error data', async()=>{
  const {runProbe}=await import('./cloud-cli');
  const {ProbeError}=await import('./probe-diagnostics');
  const secret='secret-password-code-body-https://signed.example/token';
  for (const stage of ['verify-2fa','trust-session','account-login-after-2fa','photos-indexing','photos-read'] as const) {
    const output: any[]=[];
    const error=new ProbeError('authentication_rejected',403);
    error.message=secret;
    const exit=await runProbe([],async(_,ctx)=>{ctx.stage=stage;ctx.authenticationVerified=stage.startsWith('photos-');throw error;}, value=>output.push(value));
    expect(exit).toBe(1);
    expect(output[0]).toMatchObject({stage,reason:'authentication_rejected',httpStatus:403,authenticationVerified:stage.startsWith('photos-'),photosReadVerified:false,automaticRetry:false});
    expect(JSON.stringify(output)).not.toContain(secret);
  }
  for (const error of [new Error(secret), {code:secret,status:secret,message:secret}, new ProbeError(secret as any,secret as any)]) {
    const output:any[]=[];
    await runProbe([],async()=>{throw error;},value=>output.push(value));
    expect(output[0].reason).toBe('unknown_failure');
    expect(output[0].httpStatus).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain(secret);
  }
  const getterError=new ProbeError('authentication_rejected');
  Object.defineProperty(getterError,'code',{get(){throw new Error(secret);}});
  Object.defineProperty(getterError,'status',{get(){throw new Error(secret);}});
  const output:any[]=[];
  expect(await runProbe([],async()=>{throw getterError;},value=>output.push(value))).toBe(1);
  expect(output[0].reason).toBe('unknown_failure');
});
