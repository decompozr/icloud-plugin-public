import type {Tool,CallToolResult} from '@modelcontextprotocol/sdk/types.js';
/** Narrow structural provider ports; the host owns context and monitor implementations. */
export interface MailInvocation {readonly ownerId:string;readonly accountId?:string}
export interface MailSettings {allow_writes:boolean;host:string;public_port:number;public_origin:string}
export type OperationOutcome='succeeded'|'rejected'|'partial'|'unknown'|'failed';
export interface OperationCounts {succeeded:number;failed:number;unknown:number;notAttempted:number}
export interface OperationSummary {outcome:OperationOutcome;errorCode?:string;counts?:OperationCounts}
export interface OperationClassifier {tools:readonly string[];actions:readonly string[];errorCodes:readonly string[];action(tool:string,input:unknown):string;result(result:unknown):OperationSummary;error(error:unknown):OperationSummary}
export interface MailMonitor {run<T>(tool:string,input:unknown,operation:()=>Promise<T>,classifier?:OperationClassifier):Promise<T>}
export interface MailTool {tool:Tool&{securitySchemes?:Array<{type:'oauth2';scopes:string[]}>};requiredScopes:readonly string[];enabled:()=>boolean;run:(input:unknown,scopes?:ReadonlySet<string>)=>Promise<CallToolResult>;validateIntent?:(input:unknown)=>CallToolResult|undefined}
/** Mail contributes declarations to the existing runtime; it does not create a registry. */
export interface MailRegistration {id:string;scopes:readonly {name:string;title:string;description:string;descriptionLocales?:Readonly<Record<string,string>>;enabled:()=>boolean}[];tools:readonly MailTool[];dispose?:()=>Promise<void>}
