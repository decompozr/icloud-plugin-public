import {appendFileSync} from 'node:fs';
const mode=process.argv[2]!,record=process.argv[3]!;
appendFileSync(record,JSON.stringify({pid:process.pid})+'\n');
const bytes=Buffer.from(await new Response(Bun.stdin.stream()).arrayBuffer());
const size=bytes.readUInt32BE(0),request=JSON.parse(bytes.subarray(8,8+size).toString('utf8')),body=bytes.subarray(8+size);
const write=(header:object,payload:Uint8Array=new Uint8Array())=>{const metadata=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(8);prefix.writeUInt32BE(metadata.length);prefix.writeUInt32BE(payload.length,4);return Bun.write(Bun.stdout,Buffer.concat([prefix,metadata,payload]));};
if(mode==='hang'){await new Promise(()=>{});}
else if(mode==='overflow'){await Bun.write(Bun.stdout,Buffer.alloc(100000));}
else if(mode==='stderr'){await Bun.write(Bun.stderr,'synthetic-secret-diagnostic');}
else if(mode==='lost'){appendFileSync(record,'applied\n');}
else if(mode==='malformed'){await Bun.write(Bun.stdout,'invalid-response');}
else if(mode==='missing'||mode==='locked')await write({version:1,requestId:request.requestId,status:'error',code:mode});
else{
 if(mode==='validate-add'&&(request.action!=='add'||(request.kind==='master'?body.length!==32||!body.every(value=>value===7):body.toString()!=='synthetic-password')))process.exit(2);
 const payload=request.action==='read'?(request.kind==='master'?Buffer.alloc(mode==='wrong-size'?31:32,7):Buffer.from('synthetic-password')):Buffer.alloc(0);
 await write({version:1,requestId:mode==='wrong-id'?'00000000-0000-4000-8000-000000000000':request.requestId,status:'ok'},payload);
 if(mode==='extra')await Bun.write(Bun.stdout,'extra');
 if(mode==='nonzero')process.exitCode=2;
}
bytes.fill(0);
