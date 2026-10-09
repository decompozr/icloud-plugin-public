import {semanticColors} from './design-system/semanticColors.js';
import { spacing } from './design-system/spacing.js';
import { radius } from './design-system/radius.js';

/** Shared native-dialog adapters; catalog controls remain unchanged. */
export const modalStyles = `
.status-dot{display:inline-block;width:${spacing[2]};height:${spacing[2]};border-radius:${radius.full};flex:none;background:${semanticColors.textMuted}}
.status-marker{display:grid;place-items:center;width:${spacing[6]};height:${spacing[6]};border-radius:${radius.full};flex:none;color:${semanticColors.textMuted};background:${semanticColors.surfaceSubtle}}
.status-dot[data-state=ready]{background:${semanticColors.positive}}.status-dot[data-state=missing]{background:${semanticColors.critical}}
.status-marker[data-state=ready]{color:${semanticColors.positive};background:${semanticColors.selected}}.status-marker[data-state=missing]{color:${semanticColors.critical};background:${semanticColors.criticalSurface}}
.module-requirements .step .marker{width:${spacing[6]};height:${spacing[6]};color:${semanticColors.textMuted}}
.module-requirements .step.done .marker{color:${semanticColors.positive};background:${semanticColors.selected}}
.module-requirements .step[data-step-state=error] .marker,.module-requirements .step[data-step-state=todo] .marker{color:${semanticColors.critical};background:${semanticColors.criticalSurface}}
.requirements-heading{justify-content:flex-start!important}
.draft-switch[data-pending=true] .control .track{background:${semanticColors.warningSurface}!important;border-color:${semanticColors.warning}!important}
.draft-switch[data-pending=true] .control .track .thumb{background:${semanticColors.warning}!important}

dialog[data-dz-modal]::backdrop{-webkit-backdrop-filter:blur(${spacing[1]});backdrop-filter:blur(${spacing[1]})}
@keyframes dz-modal-rise{from{transform:translateY(100%)}to{transform:none}}
@media(max-width:700px){
 dialog[data-dz-modal][open]{width:100%;max-width:100%;margin: auto 0 0;inset-inline:0;max-height:calc(100dvh - ${spacing[4]} - env(safe-area-inset-top,0px));border-radius:${radius.surface} ${radius.surface} 0 0;animation:dz-modal-rise 180ms ease-out}
 dialog[data-dz-modal]>.modal-content{padding-bottom:calc(${spacing[4]} + var(--modal-notification-space,0px) + env(safe-area-inset-bottom,0px))}
 dialog[data-dz-modal]>header{padding-inline-start:max(${spacing[4]},env(safe-area-inset-left,0px));padding-inline-end:max(${spacing[4]},env(safe-area-inset-right,0px))}
}
@media(prefers-reduced-motion:reduce){dialog[data-dz-modal][open]{animation:none}}
`;
