import {AsyncLocalStorage} from 'node:async_hooks';
/** Verified immutable identity for one protocol invocation. Never set by tool arguments. */
export interface InvocationContext {readonly ownerId:string;readonly accountId?:string;readonly signal?:AbortSignal;readonly authorize?:()=>Promise<void>}
const invocation=new AsyncLocalStorage<Readonly<InvocationContext>>();
export function invocationContext(){return invocation.getStore();}
export function withInvocationContext<T>(context:InvocationContext,run:()=>T):T{return invocation.run(Object.freeze({...context}),run);}
