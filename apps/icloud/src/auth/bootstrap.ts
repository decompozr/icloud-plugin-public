import{randomBytes}from'node:crypto';
/** Serve replaces identity headers; its loopback ingress and the local OS are trusted. */
export function createBootstrapAccess(options:{login?:string;origin:string;isEnrolled():boolean;now?:()=>number}){
 const grants=new Map<string,{expires:number;login:string;userId?:string}>(),now=options.now??Date.now;
 const cookieName='icloud_setup';
 const allowed=(request:Request)=>Boolean(options.login&&request.headers.get('tailscale-user-login')===options.login);
 function origin(request:Request){if(request.headers.get('origin')!==options.origin&&!(request.method==='GET'&&!request.headers.has('origin')&&request.headers.get('sec-fetch-site')==='same-origin'))throw Error('Origin denied');}
 function grant(request:Request){
  if(options.isEnrolled()||!allowed(request))throw Error('Enrollment denied');
  const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const value=token?grants.get(token):undefined;
  if(!value||value.expires<=now()||value.login!==options.login)throw Error('Setup session required');return value;
 }
 return{
  allowed,
  begin(request:Request,userId?:string){
   origin(request);if(options.isEnrolled()||!allowed(request))throw Error('Enrollment denied');
   for(const [key,value]of grants)if(value.expires<=now())grants.delete(key);
   if(grants.size>=100)throw Error('Too many setup sessions');
   const token=randomBytes(32).toString('base64url');grants.set(token,{expires:now()+10*60*1000,login:options.login!,userId});
   return`${cookieName}=${token}; Path=/icloud; HttpOnly; Secure; SameSite=Strict; Max-Age=600`;
  },
  authorize(request:Request,userId?:string){origin(request);const value=grant(request);if(userId!==undefined&&value.userId!==userId)throw Error('Setup session mismatch');},
  bind(request:Request,userId:string){const value=grant(request);if(value.userId&&value.userId!==userId)throw Error('Setup session mismatch');value.userId=userId;},
  resumed(request:Request,userId:string){try{return grant(request).userId===userId;}catch{return false;}},
  close(){grants.clear();},
 };
}
