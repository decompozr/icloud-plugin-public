import {mkdirSync,readFileSync,writeFileSync,statSync,existsSync}from'node:fs';
import{dirname,join,relative}from'node:path';
import{randomBytes}from'node:crypto';
import{SqliteOwnerStore}from'../storage/owner-store.js';
import type{AppSettings}from'./settings.js';
export function installation(settings:AppSettings,initialize=false){
 const keyPath=settings.master_key_file;
 for(const path of[keyPath,settings.installation_marker]){const inside=relative(settings.state_directory,path);if(!inside.startsWith('../')&&inside!=='..')throw Error('Custody files must be outside state directory');}
 const options={databasePath:join(settings.state_directory,'owner.sqlite'),markerPath:settings.installation_marker};
 if(initialize){
  if(existsSync(keyPath)||existsSync(options.databasePath)||existsSync(options.markerPath)||existsSync(join(dirname(keyPath),'bootstrap-proof')))throw Error('Installation already exists or is incomplete');
  for(const path of [settings.state_directory,dirname(keyPath),dirname(options.markerPath)])mkdirSync(path,{recursive:true,mode:0o700});
  writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});
  const proof=randomBytes(32).toString('base64url');
  const store=SqliteOwnerStore.provision({...options,masterKey:readFileSync(keyPath),bootstrapProof:proof});
  try{writeFileSync(join(dirname(keyPath),'bootstrap-proof'),proof,{flag:'wx',mode:0o600});}finally{store.close();}
 }
 const stat=statSync(keyPath);if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error('Master key must be an owner-only file');
 const masterKey=readFileSync(keyPath);if(masterKey.length!==32)throw Error('Invalid master key');
 return{store:SqliteOwnerStore.open({...options,masterKey}),masterKey};
}
