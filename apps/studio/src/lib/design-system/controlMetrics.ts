import { typography } from './typography.js';
import { spacing } from './spacing.js';
import { borderWidth } from './visualMetrics.js';

/** Border-box minima. Padding is derived from the line box, not invented per control. */
export const controlMetrics = {
  normal: {
    target: '2.25rem', paddingBlock: `calc((2.25rem - ${typography.label.fontSize} * ${typography.label.lineHeight} - ${borderWidth} * 2) / 2)`,
    paddingInline: spacing[2], iconPadding: `calc((2.25rem - 1.25rem - ${borderWidth} * 2) / 2)`, icon: '1.25rem',
    fontSize: typography.label.fontSize, lineHeight: typography.label.lineHeight
  },
  compact: {
    target: '1.75rem', paddingBlock: `calc((1.75rem - ${typography.labelCompact.fontSize} * ${typography.labelCompact.lineHeight} - ${borderWidth} * 2) / 2)`,
    paddingInline: spacing[2], iconPadding: `calc((1.75rem - 1rem - ${borderWidth} * 2) / 2)`, icon: '1rem',
    fontSize: typography.labelCompact.fontSize, lineHeight: typography.labelCompact.lineHeight
  },
  compactTouchSurface: '2rem', coarseTarget: '2.75rem', coarseIcon: '1.5rem', icon: '1.25rem', gap: spacing[1], labelGap: spacing[1], groupGap: spacing[4]
} as const;
export type ControlSize = 'normal' | 'compact';
