import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setupPlan,renderPlan} from './setup-plan.js';
import {readSettings} from '../../../apps/studio/server/server/settings.js';
const base={publicOrigin:'https://host.example.invalid',privateOrigin:'https://host.example.invalid:8443',instance:"/tmp/Owner's iCloud & <safe>"};
test('offline native/container plans parse as real settings and retain scoped paths',async()=>{const dir=await mkdtemp(join(tmpdir(),'icloud-plan-'));try{for(const mode of ['native','container'] as const){const plan=setupPlan({...base,mode});const file=join(dir,mode+'.toml');await writeFile(file,plan.toml);const parsed=readSettings(file);expect(parsed.runtime_mode).toBe(mode);expect(parsed.allow_send).toBe(false);expect(plan.routes).toHaveLength(4);for(const route of plan.routes){const path=route[4]!.slice('--set-path='.length);expect(path).not.toBe('/');expect(new URL(route[5]!).pathname).toBe(path);}expect(renderPlan(plan)).toContain('DRY RUN');}
 const native=setupPlan({...base,mode:'native'});expect(native.plist).toContain('&apos;');expect(native.plist).toContain('&amp;');expect(native.plist).toContain('&lt;');expect(native.plist).toContain('<string>--config</string>');expect(native.plist).not.toContain('/bin/sh');
 const plist=join(dir,'agent.plist');await writeFile(plist,native.plist!);if(process.platform==='darwin'){const check=Bun.spawn(['plutil','-lint',plist],{stdout:'pipe'});expect(await check.exited).toBe(0);}
 expect(setupPlan({...base,mode:'container'}).plist).toBeUndefined();
 }finally{await rm(dir,{recursive:true,force:true});}});
test('reject root, overlapping origins/listeners and unsafe executable paths',()=>{for(const change of [{instance:'/'},{privateOrigin:base.publicOrigin},{publicPort:4101,privatePort:4101},{bun:'bun'},{instance:'/tmp/x\nunsafe'}])expect(()=>setupPlan({...base,mode:'native',...change})).toThrow();});
