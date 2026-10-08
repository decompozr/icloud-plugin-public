import {test,expect} from 'bun:test';
import {fixture} from './test-fixtures/library-imap.js';
import {simpleParser} from 'mailparser';

test('M1 missing UID and rollover expose application identity-guard requirement',async()=> {
 for(const validity of [900,901]) {
  const f=await fixture({validity});try {
   const box=await f.client.mailboxOpen('INBOX');expect(box.uidValidity).toBe(BigInt(validity));
   expect(await f.client.fetchOne('999',{flags:true},{uid:true})).toBe(false);
   // Library mutation takes a UID, not a previous UIDVALIDITY; it cannot guard a stale reference.
   await f.client.messageFlagsAdd('41',['\\Seen'],{uid:true});
   expect(f.commands).toContain('UID STORE 41 +FLAGS (\\Seen)');
  }finally{await f.close();}
 }
});

test('M2 observes commands after COPY or STORE failures without claiming safe fallback',async()=> {
 for(const failure of ['copy','store']) {
  const f=await fixture({uidplus:true,rejectCopy:failure==='copy',rejectStore:failure==='store'});try {
   await f.client.mailboxOpen('INBOX');
   let outcome:unknown;try{outcome=await f.client.messageMove('41,43','Archive',{uid:true});}catch{outcome='throws';}
   const writes=f.commands.filter(c=>/COPY|STORE|EXPUNGE/.test(c));
   console.log(`M2 ${failure} rejection:`,JSON.stringify({outcome,writes},(_key,value)=>typeof value==='bigint'?value.toString():value));
   if(failure==='copy'){expect(outcome).toBe(false);expect(writes).toEqual(['UID COPY 41,43 Archive','UID STORE 41,43 +FLAGS.SILENT (\\Deleted)','UID EXPUNGE 41,43']);}
   else {expect(writes).toEqual(['UID COPY 41,43 Archive','UID STORE 41,43 +FLAGS.SILENT (\\Deleted)','UID EXPUNGE 41,43']);expect(outcome && typeof outcome==='object' && 'uidMap' in outcome).toBe(true);}
  }finally{await f.close();}
 }
});

test('M3 cooperative mailbox locks serialize overlapping tasks',async()=> {
 const f=await fixture();try {
  const operation=async(path:string,uid:string)=> {
   const lock=await f.client.getMailboxLock(path);
   try {await new Promise(resolve=>setTimeout(resolve,5));await f.client.messageFlagsAdd(uid,['\\Seen'],{uid:true});}
   finally{lock.release();}
  };
  await Promise.all([operation('INBOX','41'),operation('Archive','43')]);
  expect(f.commands.filter(c=>/^(SELECT|UID STORE)/.test(c))).toEqual(['SELECT INBOX','UID STORE 41 +FLAGS (\\Seen)','SELECT Archive','UID STORE 43 +FLAGS (\\Seen)']);
  await f.client.logout();expect(f.commands.some(c=>/^(CLOSE|EXPUNGE)$/.test(c))).toBe(false);
 }finally{await f.close();}
});

test('M4 Unicode MIME parsing includes attachments; partial source is not a completeness signal',async()=> {
 const source='Subject: =?UTF-8?B?UmXDp3U=?=\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=b\r\n\r\n--b\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\naMOpbGxv\r\n--b\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=test.bin\r\nContent-Transfer-Encoding: base64\r\n\n'+Buffer.alloc(8192,65).toString('base64')+'\r\n--b--\r\n';
 const parsed=await simpleParser(source);expect(parsed.subject).toBe('Reçu');expect(parsed.text?.trim()).toBe('héllo');expect(parsed.attachments[0]?.size).toBe(8192);
 const complete='Subject: excerpt\r\n\r\n'+ 'x'.repeat(2048);
 const cut=complete.indexOf('\r\n\r\n')+4+32;expect(cut).toBeLessThan(complete.length);
 const partial=await simpleParser(complete.slice(0,cut));expect(partial.text?.trim().length).toBe(32);
 // Parser accepts incomplete transport data: caller must track byte limits/completeness independently.
 expect(partial.subject).toBe('excerpt');
});


test('L3 lost MOVE response rejects with no automatic retry; server outcome unknowable',async()=> {
 const f=await fixture({move:true,uidplus:true,dropMoveReply:true});try {
  await f.client.mailboxOpen('INBOX');
  let failed=false;try{const value=await f.client.messageMove('41','Archive',{uid:true});failed=value===false;}catch{failed=true;}
  expect(failed).toBe(true);expect(f.commands.filter(c=>/^UID MOVE/.test(c))).toEqual(['UID MOVE 41 Archive']);
 }finally{await f.close();}
});
