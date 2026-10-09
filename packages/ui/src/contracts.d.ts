import type{Component}from'svelte';
export interface UiCopy {t(key:string):string;richText(key:string):ReadonlyArray<{text:string;strong:boolean}>;authT(key:string):string}
export type AuthMode='sign-in'|'consent'|'connect';
export type ScopeLabels=Record<string,string|Record<string,string>>;
export interface ModuleRequirementsProps {credentialReady?:boolean;credentialKnown?:boolean;onverified?:(ready:boolean)=>void}
export interface BundledModuleUi {id:string;requirement:'credential'|'native';Requirements:Component<ModuleRequirementsProps>;scopeCopy:Record<string,string>;actionDescriptions?:Record<string,string>;actionDependencies?:Record<string,readonly string[]>;presentationMetadata?:boolean;title?:string;requirementsTitleKey?:string;fieldHint?(field:string):string|undefined;unavailableCopy?(field:string):string}
