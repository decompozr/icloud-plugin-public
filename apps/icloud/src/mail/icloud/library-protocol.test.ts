import {test,expect} from 'bun:test';
import {fixture} from './test-fixtures/library-imap.js';

test('real library emits read-only SELECT and exact UID PEEK, plus exact seen/unseen STORE',async()=> {
  const f=await fixture();try {
    const box=await f.client.mailboxOpen('INBOX',{readOnly:true});
    expect(box.uidValidity).toBe(900n);
    await f.client.fetchOne('41',{source:{maxLength:1000},flags:true},{uid:true});
    expect(f.commands.some(c=>/^EXAMINE INBOX$/.test(c))).toBe(true);
    expect(f.commands.some(c=>/^UID FETCH 41 .*BODY\.PEEK\[\]<0\.1000>/.test(c))).toBe(true);
    await f.client.mailboxOpen('INBOX');
    await f.client.messageFlagsAdd('41,43',['\\Seen'],{uid:true});
    await f.client.messageFlagsRemove('41,43',['\\Seen'],{uid:true});
    expect(f.commands.filter(c=>/^UID STORE/.test(c))).toEqual(['UID STORE 41,43 +FLAGS (\\Seen)','UID STORE 41,43 -FLAGS (\\Seen)']);
    expect(f.commands.some(c=>/SEARCH|EXPUNGE/.test(c))).toBe(false);
    console.log('P0 commands:',JSON.stringify(f.commands.filter(c=>/EXAMINE|SELECT|FETCH|STORE/.test(c))));
  }finally{await f.close();}
});

test('native MOVE returns UID mapping; missing MOVE falls back to COPY and expunge',async()=> {
  for(const [native,uidplus] of [[true,true],[false,true],[false,false]]) {
    const f=await fixture({move:native,uidplus});try {
      await f.client.mailboxOpen('INBOX');
      const result=await f.client.messageMove('41,43','Archive',{uid:true});
      expect(result && result.uidMap?.get(41)).toBe(81);
      const mutation=f.commands.filter(c=>/MOVE|COPY|STORE|EXPUNGE/.test(c));
      if(native){expect(mutation).toEqual(['UID MOVE 41,43 Archive']);}
      else {expect(mutation.some(c=>/^UID COPY 41,43 Archive$/.test(c))).toBe(true);expect(mutation).toContain('UID STORE 41,43 +FLAGS.SILENT (\\Deleted)');expect(mutation).toContain(uidplus?'UID EXPUNGE 41,43':'EXPUNGE');}
      console.log(`P1 native=${native},uidplus=${uidplus}:`,JSON.stringify(mutation));
    }finally{await f.close();}
  }
});

test('special-use folders and arbitrary-keyword permission reflect server metadata',async()=> {
  for(const keywords of [false,true]) {
    const f=await fixture({keywords});try {
      const boxes=await f.client.list();expect(boxes.find(b=>b.path==='Junk')?.specialUse).toBe('\\Junk');
      const box=await f.client.mailboxOpen('INBOX');expect(box.permanentFlags?.has('\\*')).toBe(keywords);
      console.log(`P2 keywords=${keywords}:`,JSON.stringify([...box.permanentFlags!]));
    }finally{await f.close();}
  }
});
