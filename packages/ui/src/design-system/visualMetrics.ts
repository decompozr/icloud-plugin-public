import { semanticColors } from './semanticColors.js';
export const borderWidth = '1px';
export const focus = {
  outline: `2px solid ${semanticColors.focus}`,
  offset: '2px',
  shadow: `0 0 0 2px ${semanticColors.surface}`
} as const;
/** Floating context only; content hierarchy uses spacing and separators. */
export const elevation = { none: 'none', floating: '0 .125rem .5rem #20252214' } as const;
