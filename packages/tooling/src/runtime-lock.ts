import{openSync,closeSync,constants}from'node:fs';import{join}from'node:path';
import{dlopen,FFIType}from'bun:ffi';
/** Kernel-owned advisory locks disappear on exit/reboot; no stale PID files or check/write window. */
export function acquireRuntimeLock(prefix:string,name:'service-run'|'service-control'|'service-update'){
 const library=dlopen(process.platform==='darwin'?'/usr/lib/libSystem.B.dylib':'libc.so.6',{flock:{args:[FFIType.i32,FFIType.i32],returns:FFIType.i32}});
 let fd:number;try{fd=openSync(join(prefix,'runtime',name+'.lock'),constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600)}catch(error){library.close();throw error}
 if(library.symbols.flock(fd,6)!==0){closeSync(fd);library.close();throw Error(name==='service-run'?'SERVICE_ALREADY_RUNNING':name==='service-update'?'SERVICE_UPDATE_BUSY':'SERVICE_CONTROL_BUSY')}
 let closed=false;return()=>{if(!closed){closed=true;closeSync(fd);library.close()}};
}
