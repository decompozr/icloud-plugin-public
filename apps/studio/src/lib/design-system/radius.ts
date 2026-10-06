/** Concrete corner roles shared by DecompozR components. */
export const radius = { square: '0', control: '0.25rem', surface: '0.375rem', full: '9999px' } as const;
export type RadiusRole = keyof typeof radius;
