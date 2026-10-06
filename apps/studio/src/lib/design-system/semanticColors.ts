
/** Light palette values; components consume theme-aware semantic variables below. */
export const lightColors = {
  "surface": "#FFFFFF",
  "surfaceSubtle": "#F0F4E9",
  "surfaceRaised": "#FFFFFF",
  "text": "#28312A",
  "textMuted": "#566258",
  "textSubtle": "#566258",
  "textInverse": "#FFFFFF",
  "border": "#DFE6D8",
  "borderStrong": "#697860",
  "interactive": "#292B2E",
  "interactiveHover": "#414449",
  "interactiveActive": "#16181B",
  "hover": "#EDF2E6",
  "active": "#DEE7D5",
  "selected": "#E5EDDA",
  "selectedHover": "#DAE5CE",
  "selectedActive": "#CAD9BA",
  "selectedBorder": "#587044",
  "selectedText": "#28312A",
  "focus": "#496632",
  "disabledSurface": "#E2E4E7",
  "disabledText": "#5B6069",
  "readonlySurface": "#F0F4E9",
  "neutralAction": "#E5EDDA",
  "neutralActionActive": "#CAD9BA",
  "positive": "#344B3A",
  "positiveSurface": "#EDF2E9",
  "warning": "#795916",
  "warningSurface": "#F8F2E5",
  "critical": "#964B46",
  "criticalSurface": "#F8EEED",
  "informational": "#345A70",
  "informationalSurface": "#EDF3F6"
} as const;
export type SemanticColorRole = keyof typeof lightColors;

export const semanticColors = {
  surface: `var(--dz-color-surface, ${lightColors.surface})`,
  surfaceSubtle: `var(--dz-color-surfaceSubtle, ${lightColors.surfaceSubtle})`,
  surfaceRaised: `var(--dz-color-surfaceRaised, ${lightColors.surfaceRaised})`,
  text: `var(--dz-color-text, ${lightColors.text})`,
  textMuted: `var(--dz-color-textMuted, ${lightColors.textMuted})`,
  textSubtle: `var(--dz-color-textSubtle, ${lightColors.textSubtle})`,
  textInverse: `var(--dz-color-textInverse, ${lightColors.textInverse})`,
  border: `var(--dz-color-border, ${lightColors.border})`,
  borderStrong: `var(--dz-color-borderStrong, ${lightColors.borderStrong})`,
  interactive: `var(--dz-color-interactive, ${lightColors.interactive})`,
  interactiveHover: `var(--dz-color-interactiveHover, ${lightColors.interactiveHover})`,
  interactiveActive: `var(--dz-color-interactiveActive, ${lightColors.interactiveActive})`,
  hover: `var(--dz-color-hover, ${lightColors.hover})`,
  active: `var(--dz-color-active, ${lightColors.active})`,
  selected: `var(--dz-color-selected, ${lightColors.selected})`,
  selectedHover: `var(--dz-color-selectedHover, ${lightColors.selectedHover})`,
  selectedActive: `var(--dz-color-selectedActive, ${lightColors.selectedActive})`,
  selectedBorder: `var(--dz-color-selectedBorder, ${lightColors.selectedBorder})`,
  selectedText: `var(--dz-color-selectedText, ${lightColors.selectedText})`,
  focus: `var(--dz-color-focus, ${lightColors.focus})`,
  disabledSurface: `var(--dz-color-disabledSurface, ${lightColors.disabledSurface})`,
  disabledText: `var(--dz-color-disabledText, ${lightColors.disabledText})`,
  readonlySurface: `var(--dz-color-readonlySurface, ${lightColors.readonlySurface})`,
  neutralAction: `var(--dz-color-neutralAction, ${lightColors.neutralAction})`,
  neutralActionActive: `var(--dz-color-neutralActionActive, ${lightColors.neutralActionActive})`,
  positive: `var(--dz-color-positive, ${lightColors.positive})`,
  positiveSurface: `var(--dz-color-positiveSurface, ${lightColors.positiveSurface})`,
  warning: `var(--dz-color-warning, ${lightColors.warning})`,
  warningSurface: `var(--dz-color-warningSurface, ${lightColors.warningSurface})`,
  critical: `var(--dz-color-critical, ${lightColors.critical})`,
  criticalSurface: `var(--dz-color-criticalSurface, ${lightColors.criticalSurface})`,
  informational: `var(--dz-color-informational, ${lightColors.informational})`,
  informationalSurface: `var(--dz-color-informationalSurface, ${lightColors.informationalSurface})`,
} as const;

export const darkColors: Record<SemanticColorRole, string> = {
  "surface": "#191D19",
  "surfaceSubtle": "#222822",
  "surfaceRaised": "#2A3028",
  "text": "#EDF0E8",
  "textMuted": "#B6C1AF",
  "textSubtle": "#B6C1AF",
  "textInverse": "#17181B",
  "border": "#424B3E",
  "borderStrong": "#A7B59B",
  "interactive": "#E2E4E9",
  "interactiveHover": "#F3F4F6",
  "interactiveActive": "#C7CBD3",
  "hover": "#30392D",
  "active": "#404B39",
  "selected": "#35432F",
  "selectedHover": "#435139",
  "selectedActive": "#526245",
  "selectedBorder": "#C0D5A1",
  "selectedText": "#EDF0E8",
  "focus": "#D0E3B1",
  "disabledSurface": "#30333A",
  "disabledText": "#A0A6B2",
  "readonlySurface": "#222822",
  "neutralAction": "#35432F",
  "neutralActionActive": "#526245",
  "positive": "#B9DDBF",
  "positiveSurface": "#263E2D",
  "warning": "#EDCE89",
  "warningSurface": "#403722",
  "critical": "#F2B5AD",
  "criticalSurface": "#432D2A",
  "informational": "#B2D3E8",
  "informationalSurface": "#273A46"
};

export type ThemeMode = 'light' | 'dark' | 'system';
/** Apply on a theme boundary; native color-scheme resolves system mode without hydration. */
export const themeStyle = (mode: ThemeMode): string => {
  const scheme = mode === 'system' ? 'light dark' : mode;
  const variables = Object.entries(lightColors).map(([key, value]) => {
    const dark = Object.entries(darkColors).find(([name]) => name === key)?.[1] ?? value;
    return `--dz-color-${key}:light-dark(${value},${dark})`;
  }).join(';');
  return `color-scheme:${scheme};${variables};color:${semanticColors.text};background-color:${semanticColors.surface};`;
};
