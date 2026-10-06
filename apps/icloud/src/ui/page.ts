import {brandSvg} from '../../../studio/dist/index.js';
export {pageStyles} from '../../../studio/dist/index.js';
export function uiIcon(name:'brand'|'passkey'):string {
 if(name==='brand')return brandSvg.replace('<svg ', '<svg class="ui-icon" data-ui-icon="brand" aria-hidden="true" width="32" height="32" ');
 const path='<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-4-4 3-3m-6 0 3-3"/>';
 return `<svg class="ui-icon" data-ui-icon="${name}" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
export const brand=(label:string)=>`<div class="brand">${uiIcon('brand')}${label}</div>`;
export const cardOpen='<div class="card">';
