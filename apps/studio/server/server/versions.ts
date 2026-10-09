import {openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {join} from 'node:path';
function metadata(path:string):Record<string,unknown>|undefined{
 let fd:number|undefined;try{fd=openSync(path,constants.O_RDONLY|constants.O_NONBLOCK);const stat=fstatSync(fd);if(!stat.isFile()||stat.size>4096)return;const bytes=Buffer.alloc(4097),length=readSync(fd,bytes,0,bytes.length,0);if(length>4096)return;const value:unknown=JSON.parse(bytes.subarray(0,length).toString());return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;}catch{return;}finally{if(fd!==undefined)closeSync(fd);}
}
/** Version labels come from this built assets tree, never a separate current symlink. */
export function runtimeVersions(assetsDirectory:string):{version?:string;installedVersion?:string}{
 const built=metadata(join(assetsDirectory,'runtime-version.json'));
 const version=typeof built?.version==='string'&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(built.version)?built.version:undefined;
 const artifact=metadata(join(assetsDirectory,'../../../../../artifact.json'));
 const verified=version&&artifact?.format===1&&artifact.name==='icloud-plugin'&&artifact.version===version&&artifact.platform===process.platform&&artifact.arch===process.arch&&artifact.bun===Bun.version;
 return{...(version?{version}:{}),...(verified?{installedVersion:version}:{})};
}
