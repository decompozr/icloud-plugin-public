import { test, expect } from "bun:test";
import { createConnectionsService } from "./connections-service.js";
import type {
  ConnectionsRequest,
  ConnectionsResponse,
} from "./connections-service.js";
const response: ConnectionsResponse = {
  enabledScopes: ["photos.read"],
  clients: [],
  connections: [],
};
test("service sends the typed private request and returns validated data", async () => {
  const transport: typeof fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/icloud/admin/oauth-clients");
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.cache).toBe("no-store");
      return Response.json(response);
    },
    { preconnect: fetch.preconnect },
  );
  expect(await createConnectionsService(transport).list()).toEqual(response);
});
test("invalid request fails before transport and invalid response never enters UI state", async () => {
  let calls = 0;
  const transport: typeof fetch = Object.assign(
    async () => {
      calls++;
      return Response.json({ clients: "invalid" });
    },
    { preconnect: fetch.preconnect },
  );
  const service = createConnectionsService(transport);
  await expect(
    service.list({
      method: "POST",
      path: "/icloud/admin/oauth-clients",
    } as unknown as ConnectionsRequest),
  ).rejects.toThrow();
  expect(calls).toBe(0);
  await expect(service.list()).rejects.toThrow();
  expect(calls).toBe(1);
});
