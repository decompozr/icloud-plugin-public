import express from 'express';
import type {HttpLifecycle} from './lifecycle.js';
/** Preserve the configured external origin; never trust forwarded headers. */
export function fetchBridge(origin:string,handler:(request:Request)=>Promise<Response>,lifecycle?:HttpLifecycle):express.RequestHandler{
 return async(req,res)=>{
  try{
   const headers=new Headers();for(const [name,value]of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
   const body:unknown=req.body;
   const run=()=>handler(new Request(origin+req.originalUrl,{method:req.method,headers,...(Buffer.isBuffer(body)&&body.length?{body:new Uint8Array(body)}:{})}));
   const response=lifecycle?await lifecycle.track(run):await run();
   res.status(response.status);response.headers.forEach((value,name)=>{if(name!=='set-cookie')res.setHeader(name,value);});
   const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
   res.send(Buffer.from(await response.arrayBuffer()));
  }catch{res.status(500).json({error:'REQUEST_FAILED'});}
 };
}
export function guardHost(origin:string,port:number):express.RequestHandler{
 const allowed=new Set([new URL(origin).host,`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]);
 return(req,res,next)=>{if(!allowed.has(req.get('host')??'')){res.status(403).end();return;}next();};
}
