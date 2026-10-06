import { semanticColors as role } from './semanticColors.js';
export { colorShades } from './colors.js';

export type ColorPair = { readonly background: string; readonly foreground: string };


/** Named background/text combinations, not a full theme or status palette. */
export const colorPairs = {
  page: { background: role.surface, foreground: role.text },
  secondaryText: { background: role.surface, foreground: role.textMuted },
  subtleSurface: { background: role.surfaceSubtle, foreground: role.text },
  primaryAction: { background: role.interactive, foreground: role.textInverse },
  warmAction: { background: role.neutralAction, foreground: role.text },
  subtleTag: { background: role.selected, foreground: role.selectedText },
  inverse: { background: role.text, foreground: role.textInverse }
} as const satisfies Record<string, ColorPair>;
export type ColorPairName = keyof typeof colorPairs;

export type ButtonColorState = 'default' | 'hover' | 'pressed' | 'disabled';
export type ButtonColorPair = ColorPair & { readonly border: string };
const disabled = { background: role.disabledSurface, foreground: role.disabledText, border: role.disabledSurface } as const;

/** Component state recipes derived only from semantic roles. */
export const buttonColors = {
  primary: {
    default: { ...colorPairs.primaryAction, border: role.interactive },
    hover: { background: role.interactiveHover, foreground: role.textInverse, border: role.interactiveHover },
    pressed: { background: role.interactiveActive, foreground: role.textInverse, border: role.interactiveActive },
    disabled
  },
  secondary: {
    default: { ...colorPairs.page, border: role.borderStrong },
    hover: { ...colorPairs.subtleSurface, border: role.borderStrong },
    pressed: { background: role.active, foreground: role.text, border: role.borderStrong },
    disabled
  },
  warm: {
    default: { ...colorPairs.warmAction, border: role.borderStrong },
    hover: { background: role.hover, foreground: role.text, border: role.borderStrong },
    pressed: { background: role.neutralActionActive, foreground: role.text, border: role.borderStrong },
    disabled
  }
} as const satisfies Record<string, Record<ButtonColorState, ButtonColorPair>>;
export type ButtonColorName = keyof typeof buttonColors;

export const focusColors = { outline: role.focus, separation: role.surface } as const;

/** Notification meaning only; separate from brand shades and announcement urgency. */
export const feedbackColors = {
  info: { background: role.informationalSurface, foreground: role.informational },
  warning: { background: role.warningSurface, foreground: role.warning },
  error: { background: role.criticalSurface, foreground: role.critical }
} as const satisfies Record<string, ColorPair>;
export type FeedbackKind = keyof typeof feedbackColors;
