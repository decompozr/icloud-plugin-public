import {semanticColors as colors} from './design-system/semanticColors.js';
/** Shared permission meaning; labels remain authoritative, colors supplement them. */
export function permissionTagColors(scope:string){
 const action=scope.split('.').at(-1);
 if(action==='read')return{kind:'read',surface:colors.informationalSurface,ink:colors.informational};
 if(action==='delete'||action==='control')return{kind:'critical',surface:colors.criticalSurface,ink:colors.critical};
 if(['send','schedule','share','unsubscribe'].includes(action??''))return{kind:'outbound',surface:colors.warningSurface,ink:colors.warning};
 if(action==='write'||action==='automations')return{kind:'edit',surface:colors.selected,ink:colors.selectedText};
 return{kind:'neutral',surface:colors.surfaceSubtle,ink:colors.text};
}
