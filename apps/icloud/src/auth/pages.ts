import type {ScopeLabels} from './scope-labels.js';
import {i18n} from '../i18n/index.js';
import { authT } from './i18n.js';
import { pageStyles, brand, uiIcon, cardOpen } from '../ui/page.js';
export function renderAuthPage(mode:'sign-in'|'consent', privateAdmin=false,scopeLabels:ScopeLabels={}):string{
 const consent=mode==='consent';
 return `<!doctype html><html lang="${i18n.language==='zh-TW'?'zh-TW':'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${authT(consent?'titleConsent':'titleSignIn')} · ${authT('product')}</title><style>${pageStyles}</style></head><body data-auth-scope-labels="${JSON.stringify(scopeLabels).replace(/[&<>"']/g,value=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]!))}" data-auth-mode="${mode}" data-auth-return="${privateAdmin?'/icloud/admin':''}"><main class="auth-layout">${brand(authT('product'))}${cardOpen}<h1>${authT(consent?'headingConsent':'headingSignIn')}</h1>${consent?`<p class="muted">${authT('introConsent')}</p><small data-auth-client></small><ul data-auth-scopes></ul>`:`<p class="muted">${authT('introSignIn')}</p>`}<div class="actions"><button class="primary button-icon" type="button" data-auth-primary>${consent?'':uiIcon('passkey')}${authT(consent?'allow':'usePasskey')}</button>${consent?`<button class="secondary" type="button" data-auth-deny>${authT('deny')}</button>`:''}</div><p class="status" role="status" aria-live="polite" data-auth-status></p></div></main><script type="module" src="/icloud/assets/auth-browser.js"></script></body></html>`;
}
