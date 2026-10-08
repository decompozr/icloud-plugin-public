import { test, expect } from "bun:test";
import { connectionNeedsReview } from "./connection-warnings.js";
import type { RecoveryClient } from "@decompozr/contracts";
const client: RecoveryClient = {
  clientId: "client",
  name: "ChatGPT",
  registeredScopes: ["photos.read"],
  missingEnabledScopes: ["photos.delete"],
  upgradeAvailable: true,
  recovery: "explicit_client_update_then_consent",
};
test("badge includes only a connection with an actionable capability review", () => {
  expect(connectionNeedsReview(client)).toBe(true);
  expect(connectionNeedsReview({ ...client, upgradeAvailable: false })).toBe(
    false,
  );
});
test("registration review completion clears the badge even while consent is pending", () => {
  const reviewed: RecoveryClient = {
    ...client,
    registeredScopes: ["photos.read", "photos.delete"],
    missingEnabledScopes: [],
    upgradeAvailable: false,
    recovery: "fresh_consent_and_tool_refresh",
  };
  expect(connectionNeedsReview(reviewed)).toBe(false);
});
test("limited grants or an unavailable review never create a badge", () => {
  expect(connectionNeedsReview(undefined)).toBe(false);
  expect(
    connectionNeedsReview({ ...client, upgradeAvailable: undefined }),
  ).toBe(false);
  expect(
    connectionNeedsReview({
      ...client,
      upgradeAvailable: false,
      recovery: "new_client_registration_then_consent",
    }),
  ).toBe(false);
});
test("mixed connection count matches only available review actions", () => {
  const clients = [
    client,
    { ...client, clientId: "reviewed", upgradeAvailable: false },
    { ...client, clientId: "limited", upgradeAvailable: false },
  ];
  expect(clients.filter(connectionNeedsReview)).toHaveLength(1);
});
