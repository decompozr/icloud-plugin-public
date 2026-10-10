import { spacing } from '@decompozr/ui/design-system/spacing.js';
import { radius } from '@decompozr/ui/design-system/radius.js';
import { semanticColors } from '@decompozr/ui/design-system/semanticColors.js';
import { controlMetrics } from '@decompozr/ui/design-system/controlMetrics.js';
import { typography } from '@decompozr/ui/design-system/typography.js';

/** Consumer layout, focus explanation and critical action extension of the pinned Button. */
export const actionStyles = `
.globe-menu{position:relative;display:inline-flex;color:${semanticColors.text}}
.globe-menu .menu-anchor .trigger{border-color:transparent;background:transparent}
.globe-menu .trigger>.icon{visibility:hidden}
.globe-menu-glyph{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
.globe-menu-glyph svg{width:${controlMetrics.normal.icon};height:${controlMetrics.normal.icon}}
.nav-language .globe-menu .trigger{width:${controlMetrics.coarseTarget};height:${controlMetrics.coarseTarget};padding:0}
.action-explanation{position:relative;display:inline-flex;flex:none;vertical-align:middle;max-width:100%}
.dz-icon-action[data-dz-action][data-size]{padding:var(--icon-padding);flex:none}
.dz-icon-action[data-dz-action] svg{width:var(--control-icon);height:var(--control-icon)}
@media(pointer:coarse){.dz-icon-action[data-dz-action][data-size=normal] svg{width:var(--coarse-icon);height:var(--coarse-icon)}.globe-menu-glyph svg{width:${controlMetrics.coarseIcon};height:${controlMetrics.coarseIcon}}}
[data-dz-action][data-danger][data-appearance=default]:not(:disabled):not([aria-disabled=true]){--face-bg:${semanticColors.criticalSurface};--face-ink:${semanticColors.critical};--face-edge:${semanticColors.critical}}
[data-dz-action][data-danger][data-appearance=quiet]{--quiet-ink:${semanticColors.critical}!important;--quiet-hover:${semanticColors.criticalSurface}!important;--quiet-active:${semanticColors.criticalSurface}!important}
.action-hint{display:none;position:absolute;z-index:10;inset-block-start:calc(100% + ${spacing[1]});inset-inline-end:0;width:max-content;max-width:min(18rem,calc(100vw - ${spacing[8]}));padding:${spacing[2]};border:1px solid ${semanticColors.borderStrong};border-radius:${radius.control};background:${semanticColors.surface};color:${semanticColors.text};font-size:${typography.bodyCompact.fontSize};line-height:${typography.bodyCompact.lineHeight};overflow-wrap:anywhere;pointer-events:none}
.action-explanation:focus-within .action-hint{display:block}
.page-heading{position:sticky;top:0;z-index:2;background:${semanticColors.surface};min-height:${controlMetrics.coarseTarget};padding-block:${spacing[0]};margin-bottom:${spacing[2]}}
.capabilities-target{scroll-margin-block-start:calc(${controlMetrics.coarseTarget} + ${spacing[2]})}
.page-title{display:flex;align-items:center;gap:${spacing[3]};flex-wrap:wrap;min-width:0}
.service-capabilities>header{display:flex;align-items:center;justify-content:space-between;gap:${spacing[4]};margin-bottom:${spacing[3]}}
.capability-title{display:flex;align-items:center;gap:${spacing[2]}}
.module-summary{display:flex;justify-content:space-between;align-items:center;gap:${spacing[4]};flex-wrap:wrap;border-top:1px solid ${semanticColors.border};padding-block:${spacing[3]}}
.module-summary:has(.module-notices){row-gap:${spacing[2]}}
.module-summary h3{margin:0;padding:0;border:0}.module-summary .actions{margin:0}
.module-statuses{min-height:calc(${controlMetrics.coarseTarget} - 2 * ${spacing[2]});display:flex;gap:${spacing[2]};flex-wrap:wrap;margin-top:${spacing[2]}}
.module-section-heading{display:flex;align-items:center;justify-content:space-between;gap:${spacing[3]};flex-wrap:wrap;margin-block:${spacing[4]} ${spacing[2]}}
.module-section-heading h3{margin:0;padding:0;border:0;font-size:${typography.heading.fontSize};line-height:${typography.heading.lineHeight}}
.capability-config-actions{justify-content:flex-end}
.module-action-list{list-style:none;padding:0;margin:0}
.module-action-row{display:flex;align-items:flex-start;justify-content:space-between;gap:${spacing[4]};padding-block:${spacing[4]};border-bottom:1px solid ${semanticColors.border}}
.module-action-copy{min-width:0;flex:1}.module-action-copy p,.settings-save-note{font-size:${typography.body.fontSize};line-height:${typography.body.lineHeight};color:${semanticColors.textMuted}}
.module-action-copy p{margin:${spacing[1]} 0 0}.module-action-copy .module-unavailable{color:${semanticColors.critical}}
.form-error{color:${semanticColors.critical}}
.account-list:has(>.account-card:nth-child(2)){grid-template-columns:repeat(2,minmax(0,1fr))}
.overview-grid>.card{padding:${spacing[6]};border:1px solid ${semanticColors.border};border-radius:${radius.surface};background:${semanticColors.surface};margin:0}
@media(max-width:700px){.overview-grid>.card{padding:${spacing[4]}}}
@media(max-width:700px){.account-list:has(>.account-card:nth-child(2)){grid-template-columns:minmax(0,1fr)}}
.card-heading{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.card-tools,.account-actions{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.account-list{display:grid;gap:${spacing[3]};margin-block:${spacing[4]}}
.account-card,.skeleton-account{display:grid;gap:${spacing[3]};padding:${spacing[4]};border:1px solid ${semanticColors.border};border-radius:${radius.surface};background:${semanticColors.surface}}
.account-access-row{display:flex;align-items:flex-start;justify-content:space-between;gap:${spacing[3]};padding-top:${spacing[3]};border-top:1px solid ${semanticColors.border}}
.account-access-copy{min-width:0;flex:1}.account-access-heading{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}.account-access-heading h4{margin:0;font-size:${typography.heading.fontSize};line-height:${typography.heading.lineHeight}}
.account-access-heading>svg{width:${controlMetrics.compact.icon};height:${controlMetrics.compact.icon};flex:none}.account-access-copy p{margin-top:${spacing[2]};color:${semanticColors.textMuted};font-size:${typography.body.fontSize};line-height:${typography.body.lineHeight}}
.account-access-actions{display:flex;align-items:center;gap:${spacing[1]};flex:none}
@media(max-width:540px){.account-access-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;gap:${spacing[2]} ${spacing[3]}}.account-access-copy{display:contents}.account-access-heading{grid-column:1;grid-row:1}.account-access-copy>p{grid-column:1/-1;grid-row:2;margin-top:0}.account-access-actions{grid-column:2;grid-row:1;align-self:start}}
.account-card-header{display:flex;align-items:center;justify-content:flex-start;gap:${spacing[3]};flex-wrap:wrap}
.account-card h3,.account-card p,.skeleton-account p{margin:0;padding:0;border:0;overflow-wrap:anywhere}
.account-identity{min-width:0;flex:0 1 auto}
.account-statuses{display:flex;gap:${spacing[2]};flex-wrap:wrap}
.account-status{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.account-selection{display:flex;align-items:center;justify-content:space-between;gap:${spacing[3]};min-width:0}
.account-selection .account-identity{overflow-wrap:anywhere}
@media(max-width:540px){.account-card-header>.account-identity{flex-basis:100%}.connection-review{flex-direction:column;align-items:flex-start}}
.field[data-size]+label[data-size],.field[data-size]+.field[data-size]{margin-top:${controlMetrics.groupGap}}
.dz-labeled-action[data-dz-action] svg{width:var(--control-icon);height:var(--control-icon);flex:none}
`;
