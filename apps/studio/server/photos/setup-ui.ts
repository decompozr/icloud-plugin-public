import {renderPhotosSetup} from '../../dist/ui/index.js';
import {join,dirname} from 'node:path';
import {z} from 'zod';
import {runNative,runReader} from '@decompozr/photos/server/provider.js';
import type {ProviderSettings} from '@decompozr/photos/server/provider.js';
export const privacyLinks={photos:'x-apple.systempreferences:com.apple.preference.security?Privacy_Photos',files:'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',automation:'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'} as const;
export type SetupAction=keyof typeof privacyLinks|'authorize';
export function photosSetup(settings:ProviderSettings){return {
 async status(){
  let libraryReadable=false;let libraryStatus=settings.readerHelper?'unavailable':'reader_setup_required';
  if(settings.readerHelper)try{await runReader(settings.readerHelper,{command:'access',library:settings.library},10000);libraryReadable=true;libraryStatus='ready';}catch(e){if((e as Error).message==='photos_permission_required')libraryStatus='permission_required';}
  let authorization='unavailable';
  try{const native=z.object({authorized:z.boolean(),authorization:z.number().int()}).parse(await runNative(settings.nativeHelper,{command:'health'},10000));authorization=({0:'not_requested',1:'restricted',2:'denied',3:'authorized',4:'limited'} as Record<number,string>)[native.authorization]??'unavailable';}catch{}
  return {libraryReadable,libraryStatus,authorization,ready:libraryReadable&&authorization==='authorized',automation:'checked_when_editing',changesPerformed:false};
 },
 async action(action:SetupAction){
  let args:string[];
  if(action==='authorize'){
   const app=dirname(dirname(dirname(settings.nativeHelper)));
   if(!app.endsWith('.app')||join(app,'Contents','MacOS','photos-helper')!==settings.nativeHelper)throw Error('Packaged helper required');
   args=['/usr/bin/open','-n',app,'--args','--authorize'];
  }else {
   if(action==='files'&&settings.readerHelper){
    const app=dirname(dirname(dirname(settings.readerHelper)));
    if(!app.endsWith('.app')||join(app,'Contents','MacOS','photos-reader')!==settings.readerHelper)throw Error('Packaged reader required');
    const reveal=Bun.spawn(['/usr/bin/open','-R',app],{stdout:'ignore',stderr:'ignore'});
    if(await reveal.exited!==0)throw Error('Cannot reveal Photos Reader');
   }
   args=['/usr/bin/open',privacyLinks[action]];
  }
  const child=Bun.spawn(args,{stdout:'ignore',stderr:'ignore'});if(await child.exited!==0)throw Error('Cannot open settings');
  return {opened:true,ready:false,changesPerformed:false};
 }
};}
export function photosSetupSection():string{return renderPhotosSetup();}
