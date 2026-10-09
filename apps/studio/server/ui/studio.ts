import {i18n,t,richText,type CopyKey} from '../i18n/index.js';
import {authT} from '../auth/i18n.js';
import type {UiCopy} from '../../dist/ui/index.js';
/** Keep the host locale authoritative; do not bundle a second i18next instance. */
export const studioCopy:UiCopy={t:key=>t(key as CopyKey),richText:key=>richText(key as CopyKey),authT:key=>authT(key as Parameters<typeof authT>[0])};
export const studioLocale=()=>i18n.language==='zh-TW'?'zh-TW':'en';
