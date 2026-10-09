import {i18n} from '../i18n/index.js';
import {authEnglish,authChinese} from '../../dist/ui/compat-resources.js';
export {authEnglish};
export type AuthCopyKey=keyof typeof authEnglish;
i18n.addResourceBundle('en','auth',authEnglish,true,true);
i18n.addResourceBundle('zh-TW','auth',authChinese,true,true);
export function authT(key:AuthCopyKey):string{return i18n.t(key,{ns:'auth'});}
