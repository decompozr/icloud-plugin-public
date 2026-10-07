import type { RecoveryClient } from "../../../icloud/src/admin/readiness.js";
/** Use the same actionable status as the capability-review control. */
export function connectionNeedsReview(
  client: RecoveryClient | undefined,
): boolean {
  return client?.upgradeAvailable === true;
}
