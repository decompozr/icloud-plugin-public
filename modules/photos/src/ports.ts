import type {Tool,CallToolResult,ResourceTemplate,ReadResourceResult} from '@modelcontextprotocol/sdk/types.js';
export interface ScopeDescriptor {name:string;title:string;description:string;descriptionLocales?:Readonly<Record<string,string>>;enabled:()=>boolean}
export interface RegisteredTool {
 tool:Tool&{securitySchemes?:Array<{type:'oauth2';scopes:string[]}>};requiredScopes:readonly string[];enabled:()=>boolean;
 run:(input:unknown,scopes?:ReadonlySet<string>)=>Promise<CallToolResult>;
 validateIntent?:(input:unknown)=>CallToolResult|undefined;
}
export interface RegisteredResources {scheme:string;requiredScopes:readonly string[];enabled:()=>boolean;templates:(scopes:ReadonlySet<string>)=>Promise<ResourceTemplate[]>;read:(uri:string,scopes:ReadonlySet<string>)=>Promise<ReadResourceResult>;authorizeSubscription?:(uri:string,scopes:ReadonlySet<string>)=>Promise<void>;subscribe?:(uri:string,scopes:ReadonlySet<string>,updated:()=>void,failed:()=>void)=>Promise<()=>Promise<void>>}
export interface RuntimeModule {id:string;scopes:readonly ScopeDescriptor[];tools:readonly RegisteredTool[];resources?:RegisteredResources;start?:()=>Promise<void>;dispose?:()=>Promise<void>}

export interface AdminModule {id:string;title:string;fields:readonly {id:string;label:string;available?:boolean}[];capabilities():Record<string,boolean>;updateCapabilities(next:Record<string,boolean>,confirm:boolean):Promise<Record<string,boolean>>}
