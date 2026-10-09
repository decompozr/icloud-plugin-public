import type {ScopeLabels} from './scope-labels.js';
import {renderAuth,pageStyles,type AuthMode} from '../../dist/ui/index.js';
import {studioCopy,studioLocale} from '../ui/studio.js';
export function renderAuthPage(mode:AuthMode,privateAdmin=false,scopeLabels:ScopeLabels={}):string {
 return renderAuth(mode,privateAdmin,scopeLabels,studioCopy,pageStyles,studioLocale());
}
