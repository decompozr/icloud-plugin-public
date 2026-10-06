/** Working rem scale. One step is 0.25rem, equivalent to 4px at a 16px root. */
export const spacing = {
  0: '0',
  0.5: '0.125rem',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem'
} as const;

export type SpacingStep = keyof typeof spacing;
