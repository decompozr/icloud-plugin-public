import { test, expect } from "bun:test";
import { connectionWarning } from "./connection-warnings.js";
import type {
  AuthorizedConnection,
  RecoveryClient,
} from "../../../icloud/src/admin/readiness.js";
const connection: AuthorizedConnection = {
  clientId: "client",
  accountId: "account",
  name: "ChatGPT",
  grantedScopes: ["photos.read", "photos.write"],
  authorizedAt: "2026-10-07T00:00:00Z",
  expiresAt: "2026-10-08T00:00:00Z",
};
const client: RecoveryClient = {
  clientId: "client",
  name: "ChatGPT",
  registeredScopes: ["photos.read", "photos.write"],
  recovery: "explicit_client_update_then_consent",
};
test("new capability remains visible through registration update until account-bound consent", () => {
  const enabled = [
    "photos.read",
    "photos.write",
    "photos.delete",
    "offline_access",
  ];
  expect(connectionWarning(connection, client, enabled)).toBe("registration");
  const upgraded = {
    ...client,
    registeredScopes: [...client.registeredScopes, "photos.delete"],
  };
  expect(connectionWarning(connection, upgraded, enabled)).toBe("consent");
  expect(
    connectionWarning(
      {
        ...connection,
        grantedScopes: [...connection.grantedScopes, "photos.delete"],
      },
      upgraded,
      enabled,
    ),
  ).toBeUndefined();
});
test("disabled capabilities and OAuth utility scopes do not create warnings", () => {
  expect(
    connectionWarning(connection, client, [
      "photos.read",
      "photos.write",
      "offline_access",
    ]),
  ).toBeUndefined();
  expect(
    connectionWarning(connection, undefined, ["photos.delete"]),
  ).toBeUndefined();
});
test("consent status stays specific to each account on the same client", () => {
  const upgraded = {
    ...client,
    registeredScopes: [...client.registeredScopes, "photos.delete"],
  };
  const current = {
    ...connection,
    accountId: "current",
    grantedScopes: [...connection.grantedScopes, "photos.delete"],
  };
  expect(
    [connection, current].filter((c) =>
      connectionWarning(c, upgraded, ["photos.delete"]),
    ),
  ).toHaveLength(1);
});
