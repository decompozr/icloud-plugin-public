import {Database} from 'bun:sqlite';
import {lstatSync,readdirSync} from 'node:fs';
import {dirname,join,relative} from 'node:path';
import {CustodyError} from '../storage/custody-contract.js';
import {MasterAuthorityJournal} from '../storage/master-authority.js';
import {custodyDirectory,type AppSettings} from './settings.js';

/** Compatibility gate, not a Keychain backend or automatic migration entry. */
export function custodyStartup(settings:AppSettings,initialize:boolean):MasterAuthorityJournal|null {
 try{
  const directory=custodyDirectory(settings),inside=relative(settings.state_directory,directory);
  if(!inside.startsWith('../')&&inside!=='..')throw new CustodyError('invalid_input');
  // New native activation remains disabled until K0/K2 acceptance. Check this
  // independent selection before touching any stale key file or bound database.
  if(settings.custody?.master_backend==='keychain')throw new CustodyError('recovery_required');
  if(directory!==dirname(settings.master_key_file))throw new CustodyError('invalid_input');
  let names:string[];
  try{
   const info=lstatSync(directory);
   if(!info.isDirectory()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw new CustodyError('recovery_required');
   names=readdirSync(directory);
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')names=[];else throw error;}
  if(names.includes('custody-mutation.lock')||names.some(name=>name.startsWith('.master-authority.')&&name.endsWith('.pending')))throw new CustodyError('recovery_required');
  if(!settings.custody){if(names.includes('master-authority.json'))throw new CustodyError('recovery_required');return null;}
  if(initialize)throw new CustodyError('conflict'); // adoption is explicit stopped preparation
  const journal=new MasterAuthorityJournal(directory,settings.custody.installation_id);
  const record=journal.discover({requiredAuthority:'file',minimumGeneration:settings.custody.minimum_generation});
  if(record.format!==settings.custody.format||record.phase!=='file_authoritative')throw new CustodyError('recovery_required');
  return journal; // still untrusted until original-key verification in installation
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
}

/** Current account consumers are SQLite-only; never treat native pointers as revoke. */
export function rejectUnsupportedAccountCustody(databasePath:string):void {
 let db:Database|undefined;
 try{
  // SQLite must be able to roll back a hot journal before even a schema read.
  // No application schema mutation is performed; never create a missing DB.
  db=new Database(databasePath,{readwrite:true,create:false});
  if(db.query("SELECT name FROM sqlite_master WHERE name IN ('account_custody_meta','account_custody_state','account_custody_cleanup') LIMIT 1").get())throw new CustodyError('recovery_required');
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('recovery_required');}
 finally{db?.close();}
}
