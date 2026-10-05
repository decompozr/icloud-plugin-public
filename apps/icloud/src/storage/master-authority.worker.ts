// Synthetic process-crash fixture only; never imported by runtime.
import {MasterAuthorityJournal} from './master-authority.js';
import {CustodyError} from './custody-contract.js';
const input=JSON.parse(await Bun.stdin.text()) as {directory:string;installationId:string;operationId:string;key:string;checkpoint:string};
const journal=new MasterAuthorityJournal(input.directory,input.installationId,checkpoint=>{
 if(checkpoint===input.checkpoint)process.exit(73);
});
try{
 const lease=journal.acquire(input.operationId);
 journal.advance(lease,Buffer.from(input.key,'hex'),1,'copy_intent');
 throw Error('Fixture checkpoint not reached');
}catch(error){
 if(error instanceof CustodyError){console.log(JSON.stringify({code:error.code}));process.exit(74);}
 throw error;
}
