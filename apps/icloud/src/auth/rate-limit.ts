/** Single-owner service: do not derive trusted identities from forwarded headers. */
export const authRateLimit = {
 enabled: true,
 storage: 'database' as const,
 window: 60,
 max: 120,
 customRules: {
  '/oauth2/register': { window: 60, max: 10 },
  '/oauth2/token': { window: 60, max: 60 },
  '/passkey/*': { window: 60, max: 30 },
  // Only called internally by the resource verifier; never in publicPaths.
  '/oauth2/introspect': false as const,
 },
};
