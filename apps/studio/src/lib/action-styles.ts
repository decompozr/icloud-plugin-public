import { spacing } from '@decompozr/ui/design-system/spacing.js';
import { radius } from '@decompozr/ui/design-system/radius.js';
import { semanticColors } from '@decompozr/ui/design-system/semanticColors.js';
import { typography } from '@decompozr/ui/design-system/typography.js';

/** Consumer layout, focus explanation and critical action extension of the pinned Button. */
export const actionStyles = `
.action-explanation{position:relative;display:inline-flex;flex:none;vertical-align:middle;max-width:100%}
.dz-icon-action[data-dz-action]{padding:var(--icon-padding);flex:none}
.dz-icon-action[data-dz-action] svg{width:var(--control-icon);height:var(--control-icon)}
[data-dz-action][data-danger]:not(:disabled):not([aria-disabled=true]){--face-bg:${semanticColors.criticalSurface};--face-ink:${semanticColors.critical};--face-edge:${semanticColors.critical}}
.action-hint{display:none;position:absolute;z-index:10;inset-block-start:calc(100% + ${spacing[1]});inset-inline-end:0;width:max-content;max-width:min(18rem,calc(100vw - ${spacing[8]}));padding:${spacing[2]};border:1px solid ${semanticColors.borderStrong};border-radius:${radius.control};background:${semanticColors.surface};color:${semanticColors.text};font-size:${typography.bodyCompact.fontSize};line-height:${typography.bodyCompact.lineHeight};overflow-wrap:anywhere;pointer-events:none}
.action-explanation:focus-within .action-hint{display:block}
.card-tools,.account-actions{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.account-list{display:grid;gap:${spacing[3]};margin-block:${spacing[4]}}
.account-card{display:grid;gap:${spacing[3]};padding:${spacing[4]};border:1px solid ${semanticColors.border};border-radius:${radius.surface};background:${semanticColors.surface}}
.account-card-header{display:flex;align-items:center;justify-content:space-between;gap:${spacing[3]};flex-wrap:wrap}
.account-card h3,.account-card p{margin:0;padding:0;border:0;overflow-wrap:anywhere}
.account-identity{min-width:0;flex:1}
.account-statuses{display:flex;gap:${spacing[2]};flex-wrap:wrap}
.account-status{display:flex;align-items:center;gap:${spacing[2]};flex-wrap:wrap}
.account-selection{display:flex;align-items:center;justify-content:space-between;gap:${spacing[3]};min-width:0}
.account-selection .account-identity{overflow-wrap:anywhere}
@media(max-width:540px){.account-card-header>.account-identity{flex-basis:100%}.connection-review{flex-direction:column;align-items:flex-start}}
.dz-labeled-action[data-dz-action] svg{width:var(--control-icon);height:var(--control-icon);flex:none}
`;
