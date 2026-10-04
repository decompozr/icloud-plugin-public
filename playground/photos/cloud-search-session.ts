import type {CloudSession} from './cloud-client';
import {ProbeError} from './probe-diagnostics';
// Public Apple client: icloud.com/system/icloud.com/2636Build34/en-us/main.js,
// generateSessionIdToken. This only bootstraps pairing; it is not person search.
export async function createSearchSession(session:CloudSession):Promise<{sessionIdToken:string}> {
 const response=await session.request('https://setup.icloud.com/setup/ws/1/generateSessionIdToken',{method:'GET',headers:{Accept:'application/json'}});
 if(!response.ok)throw new ProbeError('authentication_rejected',response.status);
 let value:any;try{value=await response.json();}catch{throw new ProbeError('invalid_response');}
 if(!value||typeof value.sessionIdToken!=='string'||!value.sessionIdToken.trim()||value.sessionIdToken.length>16384||/[\r\n]/.test(value.sessionIdToken)||value.error||value.serverErrorCode)throw new ProbeError('invalid_response');
 return {sessionIdToken:value.sessionIdToken};
}
