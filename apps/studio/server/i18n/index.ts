import {createInstance} from 'i18next';
import {en,zh} from '../../dist/ui/compat-resources.js';
export {en};
export type CopyKey=keyof typeof en;
export const i18n=createInstance();
void i18n.init({lng:'en',fallbackLng:'en',initImmediate:false,resources:{en:{translation:en},'zh-TW':{translation:zh}},interpolation:{escapeValue:false}});
export function t(key:CopyKey):string{return i18n.t(key);}
export function isCopyKey(value:string):value is CopyKey{return Object.hasOwn(en,value);}

export function richText(key:CopyKey):ReadonlyArray<{text:string;strong:boolean}>{return t(key).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part=>part.startsWith('**')&&part.endsWith('**')?{text:part.slice(2,-2),strong:true}:{text:part,strong:false});}
