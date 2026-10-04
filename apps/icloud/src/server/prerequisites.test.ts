import {test,expect} from 'bun:test';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prerequisites} from './prerequisites.js';
import type {AppSettings} from './settings.js';
const settings:AppSettings={public_origin:'https://example.ts.net',private_origin:'https://example.ts.net:8443',public_port:4100,private_port:4101,host:'127.0.0.1',runtime_mode:'native',state_directory:'/fixture',master_key_file:'/fixture/key',installation_marker:'/fixture/marker',allow_writes:false,allow_send:false,tailscale_binary:'/fixture/tailscale'};
function stream(text:string,onCancel=()=>{}){return new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(text));controller.close();},cancel:onCancel});}
const fetchFixture=async()=>new Response('icloud-private');
test('reads fixed status fields and exact private health without exposing inventory',async()=>{
 const calls:readonly string[][]=[];const value=await prerequisites(settings,{spawn:argv=>{(calls as string[][]).push([...argv]);return{stdout:stream(JSON.stringify({BackendState:'Running',Self:{Online:true},Peers:['SECRET']})),exited:Promise.resolve(0),kill:()=>{}};},fetch:fetchFixture});expect(value).toEqual({installed:true,authenticated:true,online:true,privateReachable:true});expect(calls).toEqual([['/fixture/tailscale','status','--json']]);expect(JSON.stringify(value)).not.toContain('SECRET');
});
test('oversized stdout remains fail closed and kills the fixture child',async()=>{
 let killed=0;const value=await prerequisites(settings,{spawn:()=>({stdout:stream('x'.repeat(65537)),exited:Promise.resolve(0),kill:()=>killed++}),fetch:fetchFixture});expect(value.installed).toBe(false);expect(value.authenticated).toBe(false);expect(value.online).toBe(false);expect(killed).toBe(1);
});
test('stalled stdout deadline cancels stream and kills child without waiting for exit',async()=>{
 let killed=0,cancelled=0;const value=await prerequisites(settings,{commandTimeoutMs:5,spawn:()=>({stdout:new ReadableStream({cancel(){cancelled++;}}),exited:new Promise(()=>{}),kill:()=>killed++}),fetch:fetchFixture});expect(value.installed).toBe(false);expect(value.authenticated).toBe(false);expect(killed).toBeGreaterThan(0);expect(cancelled).toBe(1);
});
test('stalled exit is bounded even when stdout closes',async()=>{
 const value=await prerequisites(settings,{commandTimeoutMs:5,spawn:()=>({stdout:stream('{}'),exited:new Promise(()=>{}),kill:()=>{}}),fetch:fetchFixture});expect(value.authenticated).toBe(false);expect(value.online).toBe(false);
});
test('health reads accept only bounded exact text and keep errors separate from node status',async()=>{
 for(const body of ['icloud-private-extra','x'.repeat(65537),'icloud-public','']){const value=await prerequisites(settings,{spawn:()=>({stdout:stream('{"BackendState":"Running","Self":{"Online":true}}'),exited:Promise.resolve(0),kill:()=>{}}),fetch:async()=>new Response(body)});expect(value.authenticated).toBe(true);expect(value.online).toBe(true);expect(value.privateReachable).toBe(false);}
});

test('status file reads are size bounded, regular-file only and retain timestamp validation',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'icloud-prerequisite-fixture-'));const path=join(directory,'status.json');let spawned=0;
 const deps={spawn:()=>{spawned++;throw new Error('Must not spawn');},fetch:fetchFixture};
 try{
  writeFileSync(path,JSON.stringify({installed:true,authenticated:true,online:true,checkedAt:new Date().toISOString()}));expect((await prerequisites({...settings,tailscale_status_file:path},deps)).online).toBe(true);
  for(const content of ['x'.repeat(65537),JSON.stringify({installed:true,authenticated:true,online:true,checkedAt:new Date(0).toISOString()})]){writeFileSync(path,content);expect((await prerequisites({...settings,tailscale_status_file:path},deps)).online).toBe(false);}
  expect((await prerequisites({...settings,tailscale_status_file:directory},deps)).online).toBe(false);expect(spawned).toBe(0);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
