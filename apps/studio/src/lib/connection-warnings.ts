import type {
  AuthorizedConnection,
  RecoveryClient,
} from "../../../icloud/src/admin/readiness.js";
export type ConnectionWarning = "registration" | "consent";
/** Available permissions do not imply consent or invalidate existing access. */
export function connectionWarning(
  connection: AuthorizedConnection,
  client: RecoveryClient | undefined,
  enabledScopes: readonly string[],
): ConnectionWarning | undefined {
  if (!client) return undefined;
  const enabled = enabledScopes.filter((scope) => scope.includes("."));
  if (enabled.some((scope) => !client.registeredScopes.includes(scope)))
    return "registration";
  if (enabled.some((scope) => !connection.grantedScopes.includes(scope)))
    return "consent";
  return undefined;
}
