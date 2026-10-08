import type{Component}from'svelte';
export interface UiCopy {t(key:string):string;richText(key:string):ReadonlyArray<{text:string;strong:boolean}>;authT(key:string):string}
export type AuthMode='sign-in'|'consent'|'connect';
export type ScopeLabels=Record<string,string|Record<string,string>>;
export interface ModuleUiContext {
 readonly copy:UiCopy;
 readonly moduleId:string;
 request(operation:string,input?:unknown):Promise<Response>;
 readonly account:{list():Promise<Array<{id:string;user:string;label?:string;credentialStored:boolean}>>;openCredentials():void};
 readonly ui:{notify(key:string,tone?:'success'|'error'|'info'):void;confirm(key:string):Promise<boolean>};
 reportReady(ready:boolean):void;
}
export interface ModuleSectionProps {ctx:ModuleUiContext;embedded?:boolean}
export interface ModuleRequirement {kind:'app-password';titleKey:string;hintKey:string}
export interface ModulePage {id:string;titleKey:string;navbar?:boolean;Component:Component<ModuleSectionProps>}
export interface BundledModuleUi {id:string;requirement:'credential'|'native';requirements?:readonly ModuleRequirement[];Section?:Component<ModuleSectionProps>;pages?:readonly ModulePage[];operations?:Readonly<Record<string,{path:string;method:'GET'|'POST'}>>;scopeCopy:Record<string,string>;presentationMetadata?:boolean;title?:string;requirementsTitleKey?:string;fieldHint?(field:string):string|undefined;unavailableCopy?(field:string):string}
