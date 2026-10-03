/** Deterministic, uncompressed ZIP for the small portable client package. */
export function pluginZip(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
 const local: Buffer[] = [], central: Buffer[] = []; let offset=0;
 for(const [path,bytes] of [...files].sort(([a],[b])=>a.localeCompare(b))){
  if(!/^icloud-plugin\/[A-Za-z0-9._/-]+$/.test(path)||path.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe ZIP path');
  const name=Buffer.from(path),data=Buffer.from(bytes);if(data.length>5*1024*1024)throw Error('Plugin file too large');
  let crc=0xffffffff;for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x21,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
  local.push(header,name,data);central.push(entry,name);offset+=header.length+name.length+data.length;
 }
 if(files.size>100)throw Error('Too many plugin files');
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,directory,end]);
}
