import { spacing } from '@decompozr/ui/design-system/spacing.js';
import { radius } from '@decompozr/ui/design-system/radius.js';
import { semanticColors } from '@decompozr/ui/design-system/semanticColors.js';
import { controlMetrics } from '@decompozr/ui/design-system/controlMetrics.js';
import { typography } from '@decompozr/ui/design-system/typography.js';

/** Consumer layout, focus explanation and critical action extension of the pinned Button. */
export const actionStyles = `
.action-explanation{position:relative;display:inline-flex;flex:none;vertical-align:middle;max-width:100%}
.dz-icon-action[data-dz-action]{padding:var(--icon-padding);flex:none}
.dz-icon-action[data-dz-action] svg{width:var(--control-icon);height:var(--control-icon)}
[data-dz-action][data-danger]:not(:disabled):not([aria-disabled=true]){--face-bg:${semanticColors.criticalSurface};--face-ink:${semanticColors.critical};--face-edge:${semanticColors.critical}}
.action-hint{display:none;position:absolute;z-index:10;inset-block-start:calc(100% + ${spacing[1]});inset-inline-end:0;width:max-content;max-width:min(18rem,calc(100vw - ${spacing[8]}));padding:${spacing[2]};border:1px solid ${semanticColors.borderStrong};border-radius:${radius.control};background:${semanticColors.surface};color:${semanticColors.text};font-size:${typography.bodyCompact.fontSize};line-height:${typography.bodyCompact.lineHeight};overflow-wrap:anywhere;pointer-events:none}
.action-explanation:focus-within .action-hint{display:block}
.next-step{display:flex;align-items:center;justify-content:space-between;gap:${spacing[4]};flex-wrap:wrap;padding:${spacing[4]};border-bottom:1px solid ${semanticColors.border};background:${semanticColors.surfaceSubtle}}
.next-step h2,.next-step p{margin:0}.next-step p{margin-top:${spacing[2]}}
.page-heading{position:sticky;top:0;z-index:2;background:${semanticColors.surface};padding-block:${spacing[1]}}
.capabilities-target{scroll-margin-block-start:calc(${controlMetrics.coarseTarget} + ${spacing[6]})}
.page-title{display:flex;align-items:center;gap:${spacing[3]};flex-wrap:wrap;min-width:0}
.readable-navigation{display:none}
@media(max-width:700px),(hover:none){.readable-navigation{display:inline-flex}}
.allowed-actions-heading{justify-content:flex-start!important}
.capability-title{display:flex;align-items:center;gap:${spacing[2]}}
.module-summary{display:flex;justify-content:space-between;align-items:center;gap:${spacing[4]};flex-wrap:wrap;border-top:1px solid ${semanticColors.border};padding-block:${spacing[3]}}
.module-summary h3{margin:0;padding:0;border:0}.module-summary .actions{margin:0}
.module-statuses{display:flex;gap:${spacing[2]};flex-wrap:wrap;margin-top:${spacing[2]}}
.module-section-heading{display:flex;align-items:center;justify-content:space-between;gap:${spacing[3]};flex-wrap:wrap;margin-block:${spacing[4]} ${spacing[2]}}
.module-section-heading h3{margin:0;padding:0;border:0;font-size:${typography.heading.fontSize};line-height:${typography.heading.lineHeight}}
.module-action-list{list-style:none;padding:0;margin:0}
.module-action-row{display:flex;align-items:center;justify-content:space-between;gap:${spacing[4]};padding-block:${spacing[4]};border-bottom:1px solid ${semanticColors.border}}
.module-action-copy{min-width:0;flex:1}.module-action-copy p,.settings-save-note{font-size:${typography.body.fontSize};line-height:${typography.body.lineHeight};color:${semanticColors.textMuted}}
.module-action-copy p{margin:${spacing[1]} 0 0}.module-action-copy .module-unavailable{color:${semanticColors.critical}}
.form-error{color:${semanticColors.critical}}
.account-list:has(>.account-card:nth-child(2)){grid-template-columns:repeat(2,minmax(0,1fr))}
.account-panel{--panel-border:0;--panel-inline-inset:0}
@media(max-width:700px){.account-list:has(>.account-card:nth-child(2)){grid-template-columns:minmax(0,1fr)}}
.card-heading{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.card-tools,.account-actions{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.account-list{display:grid;gap:${spacing[3]};margin-block:${spacing[4]}}
.account-card{display:grid;gap:${spacing[3]};padding:${spacing[4]};border:1px solid ${semanticColors.border};border-radius:${radius.surface};background:${semanticColors.surface}}
.account-card-header{display:flex;align-items:center;justify-content:flex-start;gap:${spacing[3]};flex-wrap:wrap}
.account-card h3,.account-card p{margin:0;padding:0;border:0;overflow-wrap:anywhere}
.account-identity{min-width:0;flex:0 1 auto}
.account-statuses{display:flex;gap:${spacing[2]};flex-wrap:wrap}
.account-status{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.account-selection{display:flex;align-items:center;justify-content:space-between;gap:${spacing[3]};min-width:0}
.account-selection .account-identity{overflow-wrap:anywhere}
@media(max-width:540px){.account-card-header>.account-identity{flex-basis:100%}.connection-review{flex-direction:column;align-items:flex-start}}
.dz-labeled-action[data-dz-action] svg{width:var(--control-icon);height:var(--control-icon);flex:none}
`;
