import {
  connectionsRequestSchema,
  recoverySchema,
  type ConnectionsRequest,
  type ConnectionsResponse,
} from "../../../icloud/src/admin/readiness.js";
export type {
  ConnectionsRequest,
  ConnectionsResponse,
} from "../../../icloud/src/admin/readiness.js";
export const connectionsRequest: ConnectionsRequest = {
  method: "GET",
  path: "/icloud/admin/oauth-clients",
};
export interface ConnectionsService {
  list(request?: ConnectionsRequest): Promise<ConnectionsResponse>;
}
/** Validate both boundaries before data reaches reactive UI state. */
export function createConnectionsService(
  transport: typeof fetch = fetch,
): ConnectionsService {
  return {
    async list(request: ConnectionsRequest = connectionsRequest): Promise<ConnectionsResponse> {
      const { method, path } = connectionsRequestSchema.parse(request);
      const response = await transport(path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Connections request failed");
      const payload: unknown = await response.json();
      return recoverySchema.parse(payload);
    },
  };
}
