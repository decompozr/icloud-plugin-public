import {i18n} from '../i18n/index.js';
export type ScopeLabels=Record<string,string|Record<string,string>>;
/** Unknown locales fall back to the module's default description, then its identifier. */
export function consentScopeLabel(labels:ScopeLabels,scope:string,locale=i18n.language):string {
 const value=Object.hasOwn(labels,scope)?labels[scope]:undefined;
 if(typeof value==='string')return value;
 if(!value)return scope;
 const exact=Object.keys(value).find(key=>key.toLowerCase()===locale.toLowerCase());
 return (exact?value[exact]:undefined)??value.default??scope;
}
