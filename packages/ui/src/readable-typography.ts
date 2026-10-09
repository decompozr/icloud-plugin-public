import { typography } from './design-system/typography.js';

/** Studio reading recipe: compose pinned metrics without changing vendor roles. */
export const readableTypography = {
  ...typography.body,
  fontSize: typography.heading.fontSize,
  lineHeight: typography.heading.lineHeight,
} as const;
