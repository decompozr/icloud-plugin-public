import {mkdirSync,readFileSync,writeFileSync,lstatSync,existsSync}from'node:fs';
import{dirname,join,relative}from'node:path';
import{randomBytes}from'node:crypto';
import{SqliteOwnerStore}from'@decompozr/account/server';
import type{AppSettings}from'./settings.js';
function privatePath(path:string,directory=false,optional=false){
 let info;try{info=lstatSync(path);}catch(error){if(optional&&(error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
 if(!(directory?info.isDirectory():info.isFile())||(info.mode&0o077)!==0||info.uid!==process.getuid?.())throw Error('Installation paths must be owned private regular files or directories');
}
export function installation(settings:AppSettings,initialize=false){
 const keyPath=settings.master_key_file;
 for(const path of[keyPath,settings.installation_marker]){const inside=relative(settings.state_directory,path);if(!inside.startsWith('../')&&inside!=='..')throw Error('Custody files must be outside state directory');}
 const options={databasePath:join(settings.state_directory,'owner.sqlite'),markerPath:settings.installation_marker};
 if(initialize){
  if(existsSync(keyPath)||existsSync(options.databasePath)||existsSync(options.markerPath)||existsSync(join(dirname(keyPath),'bootstrap-proof')))throw Error('Installation already exists or is incomplete');
  for(const path of [settings.state_directory,dirname(keyPath),dirname(options.markerPath)])mkdirSync(path,{recursive:true,mode:0o700});
  for(const path of [settings.state_directory,dirname(keyPath),dirname(options.markerPath)])privatePath(path,true);
  writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});
  const proof=randomBytes(32).toString('base64url');
  const store=SqliteOwnerStore.provision({...options,masterKey:readFileSync(keyPath),bootstrapProof:proof});
  try{writeFileSync(join(dirname(keyPath),'bootstrap-proof'),proof,{flag:'wx',mode:0o600});}finally{store.close();}
 }
 for(const path of [settings.state_directory,dirname(keyPath),dirname(options.markerPath)])privatePath(path,true);
 for(const path of [keyPath,options.markerPath,options.databasePath])privatePath(path);
 for(const name of ['auth.sqlite','auth.sqlite-wal','auth.sqlite-shm','auth.sqlite-journal','owner.sqlite-wal','owner.sqlite-shm','owner.sqlite-journal'])privatePath(join(settings.state_directory,name),false,true);
 privatePath(join(dirname(keyPath),'bootstrap-proof'),false,true);
 const masterKey=readFileSync(keyPath);if(masterKey.length!==32)throw Error('Invalid master key');
 return{store:SqliteOwnerStore.open({...options,masterKey}),masterKey};
}
