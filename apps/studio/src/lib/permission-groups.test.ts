import { test, expect } from "bun:test";
import { permissionGroups } from "../../../../packages/ui/src/permission-groups.js";
test("reconnecting separates HomeKit from offline and unknown connection permissions", () => {
  const groups = permissionGroups([
    "offline_access",
    "homekit.automations",
    "mail.read",
    "homekit.read",
    "future.scope",
  ]);
  expect(groups.find((g) => g.title === "permissionHomeKit")?.scopes).toEqual([
    "homekit.automations",
    "homekit.read",
  ]);
  expect(
    groups.find((g) => g.title === "permissionConnection")?.scopes,
  ).toEqual(["offline_access", "future.scope"]);
  expect(groups.flatMap((g) => g.scopes).sort()).toEqual(
    [
      "offline_access",
      "homekit.automations",
      "mail.read",
      "homekit.read",
      "future.scope",
    ].sort(),
  );
  expect(permissionGroups([])).toEqual([]);
  expect(permissionGroups(["homekit.read"]).map((g) => g.title)).toEqual([
    "permissionHomeKit",
  ]);
});
