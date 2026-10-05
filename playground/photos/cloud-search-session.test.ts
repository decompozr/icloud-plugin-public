import {test,expect} from 'bun:test';
import {createSearchSession} from './cloud-search-session';
const session=(response:Response)=>({dsid:'123',webservices:{},request:async(url:any,init:any)=>{expect(String(url)).toBe('https://setup.icloud.com/setup/ws/1/generateSessionIdToken');expect(init.method).toBe('GET');expect(init.body).toBeUndefined();return response;}});
test('source-backed bootstrap returns secret only to caller and rejects provider/malformed responses',async()=>{
 expect(await createSearchSession(session(Response.json({sessionIdToken:'synthetic-private-token'})))).toEqual({sessionIdToken:'synthetic-private-token'});
 for(const response of [Response.json({sessionIdToken:''}),Response.json({privateMessage:'secret'}),Response.json({sessionIdToken:'token',serverErrorCode:'ERROR'}),new Response('notjson')])await expect(createSearchSession(session(response))).rejects.toMatchObject({code:'invalid_response'});
 await expect(createSearchSession(session(new Response(null,{status:401})))).rejects.toMatchObject({code:'authentication_rejected',status:401});
});
