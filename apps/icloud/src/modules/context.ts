import {AsyncLocalStorage} from 'node:async_hooks';
/** Immutable grant identity; selected account is validated against the grant before invocation. */
export interface InvocationContext {readonly ownerId:string;readonly accountId?:string;readonly accountIds?:readonly string[]}
const invocation=new AsyncLocalStorage<Readonly<InvocationContext>>();
export function invocationContext(){return invocation.getStore();}
export function withInvocationContext<T>(context:InvocationContext,run:()=>T):T{return invocation.run(Object.freeze({...context,...(context.accountIds?{accountIds:Object.freeze([...context.accountIds])}:{})}),run);}
