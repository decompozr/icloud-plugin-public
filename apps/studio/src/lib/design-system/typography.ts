export const fontFamily = {
  sans: "'DecompozR Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
} as const;
const body = { fontFamily: fontFamily.sans, fontSize: '.875rem', lineHeight: 20 / 14, fontWeight: 400 } as const;
const compact = { ...body, fontSize: '.8125rem', lineHeight: 18 / 13 } as const;
/** Visual roles, independent of HTML semantics. All sizes follow the user's root. */
export const typography = {
  body,
  bodyCompact: compact,
  label: { ...body, fontWeight: 500 },
  labelCompact: { ...compact, fontWeight: 500 },
  caption: { ...body, fontSize: '.75rem', lineHeight: 16 / 12 },
  heading: { ...body, fontSize: '1rem', lineHeight: 1.5, fontWeight: 600 },
  code: { ...body, fontFamily: fontFamily.mono },
  codeCompact: { ...compact, fontFamily: fontFamily.mono }
} as const;
export type TypographyRole = keyof typeof typography;
/** Apply a visual role to consumer-owned semantic HTML, without global CSS. */
export function typographyStyle(role: TypographyRole): string {
  const type = typography[role];
  return `font-family:${type.fontFamily};font-size:${type.fontSize};font-weight:${type.fontWeight};line-height:${type.lineHeight}`;
}
