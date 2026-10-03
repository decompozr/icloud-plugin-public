import { createServer, type Socket } from 'node:net';
import { ImapFlow } from 'imapflow';

// Deliberately minimal local protocol fixture, not an iCloud emulator.
export async function fixture(options: { move?: boolean; uidplus?: boolean; keywords?: boolean; validity?: number; rejectCopy?: boolean; rejectStore?: boolean; dropMoveReply?: boolean } = {}) {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close',()=>sockets.delete(socket));
    socket.write('* OK local research fixture\r\n');
    let buffer = '';
    socket.on('data',data=> {
      buffer += data.toString();
      while (buffer.includes('\r\n')) {
        const cut=buffer.indexOf('\r\n'); const line=buffer.slice(0,cut); buffer=buffer.slice(cut+2);
        const split=line.indexOf(' '); const tag=line.slice(0,split), command=line.slice(split+1);
        commands.push(command);
        const reply=(value:string)=>socket.write(value+'\r\n');
        if (/^CAPABILITY/i.test(command)) reply(`* CAPABILITY IMAP4rev1 SPECIAL-USE${options.move?' MOVE':''}${options.uidplus?' UIDPLUS':''}`);
        else if (/^LOGIN/i.test(command)) { /* fixed dummy credentials only */ }
        else if (/^LIST/i.test(command)) {
          if (command === 'LIST \"\" \"\"') reply('* LIST (\\Noselect) \"/\" \"\"');
          else reply('* LIST (\\HasNoChildren \\Junk) \"/\" \"Junk\"');
        }
        else if (/^(SELECT|EXAMINE)/i.test(command)) {
          reply('* FLAGS (\\Seen \\Flagged \\Deleted)');
          reply(`* OK [PERMANENTFLAGS (\\Seen \\Flagged \\Deleted${options.keywords?' \\*':''})] flags`);
          reply('* 3 EXISTS'); reply(`* OK [UIDVALIDITY ${options.validity ?? 900}] validity`); reply('* OK [UIDNEXT 44] next');
        } else if (/^UID FETCH/i.test(command)) {
          if (/^UID FETCH 999 /.test(command)) {reply(`${tag} OK no matching UID`);continue;}
          const source='Subject: fixture\r\n\r\nhello';
          reply(`* 1 FETCH (UID 41 FLAGS () BODY[] {${Buffer.byteLength(source)}}\r\n${source})`);
        } else if (/^UID (MOVE|COPY)/i.test(command)) {
          if(options.dropMoveReply){socket.destroy();continue;}
          if(options.rejectCopy && /^UID COPY/.test(command)){reply(`${tag} NO copy failed`);continue;}
          reply(`${tag} OK [COPYUID 901 41,43 81,83] copied`); continue;
        } else if (/^(UID )?(STORE|EXPUNGE)/i.test(command)) { if(options.rejectStore && /STORE/.test(command)){reply(`${tag} NO store failed`);continue;} }
        else if (/^LOGOUT/i.test(command)) { reply('* BYE fixture complete'); reply(`${tag} OK logout`);socket.end();continue; }
        else { reply(`${tag} BAD unsupported fixture command`); continue; }
        reply(`${tag} OK complete`);
      }
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  const client = new ImapFlow({host:'127.0.0.1',port:address.port,secure:false,doSTARTTLS:false,auth:{user:'fixture',pass:'dummy'},logger:false,disableAutoIdle:true});
  await client.connect();
  return {client,commands,async close(){client.close();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
