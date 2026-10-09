import {renderAdmin,pageStyles,type AdminState} from '../../dist/ui/index.js';
import type {CopyKey} from '../i18n/index.js';
import {studioCopy,studioLocale} from '../ui/studio.js';
export interface AdminPresentation {capabilities:readonly {id:string;label?:string;copyKey?:CopyKey}[];credentialStepLabel:CopyKey;credentialSection(admin:boolean):string}
export function setupPage(state:AdminState):string {return renderAdmin(state,studioCopy,pageStyles,studioLocale());}
