/** Base palette. These values do not assign theme or status roles. */
export const colors = {
  charcoal: '#202522',
  sage: '#52705A',
  stone: '#EFF2ED',
  cream: '#F5F7F4',
  taupe: '#DCE3D8'
} as const;

export type ColorName = keyof typeof colors;

/** Working matte light-interface shades; archived reference values remain historical. */
export const colorShades = {
  neutral: { white: '#FFFFFF', charcoal: colors.charcoal, secondary: '#59615C', soft: '#E7EBE7', cream: colors.cream, edge: '#737C73' },
  sage: { pale: '#EDF2E9', base: colors.sage, edge: '#52705A', deep: '#344B3A', hover: '#E2EBDD', pressed: '#D5E1CE', actionHover: '#445F4B', actionPressed: '#374F3D' },
  stone: { pale: '#F5F7F4', base: colors.stone, deep: '#737C73', pressed: '#E2E7DF' },
  taupe: { pale: '#F0F3EE', base: colors.taupe, deep: '#737C73' }
} as const;

/** Restrained feedback pigments; semantic meaning is assigned in semanticColors. */
export const feedbackPalette = {
  blue: { pale: '#EDF3F6', ink: '#345A70' },
  amber: { pale: '#F8F2E5', ink: '#795916' },
  red: { pale: '#F8EEED', ink: '#964B46' }
} as const;
