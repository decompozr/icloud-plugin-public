import { z } from "zod";
import { evidenceSchema } from "../../../icloud/src/admin/readiness.js";
export const statusSchema = z.object({
  localOwner: z.boolean().optional(),
  ready: z.boolean(),
  enrolled: z.boolean(),
  passkeyRegistered: z.boolean(),
  bootstrapAuthorized: z.boolean(),
  prerequisites: z.object({
    installed: z.boolean(),
    authenticated: z.boolean(),
    online: z.boolean(),
    privateReachable: z.boolean(),
  }),
});
export const dashboardSchema = z.object({
  evidence: z.array(evidenceSchema).optional(),
  accounts: z.array(
    z.object({
      id: z.string(),
      user: z.string(),
      label: z.string(),
      credentialStored: z.boolean(),
    }),
  ),
  capabilities: z.record(z.string(), z.boolean()).nullable(),
  modules: z.record(z.record(z.boolean())).optional(),
});
export const systemSchema = z.object({
 locations:z.object({runtimeDirectory:z.string(),stateDirectory:z.string(),installationDirectory:z.string().nullable()}).optional(),
  checkedAt: z.string().datetime(),
  process: z.object({
    state: z.literal("running"),
    pid: z.number(),
    uptimeSeconds: z.number(),
    version: z.string().nullable(),
    runtime: z.string(),
  }),
  installed: z.object({
    state: z.enum(["unknown", "verified"]),
    version: z.string().nullable(),
  }),
  connectivity: z.object({
    state: z.enum(["unknown", "observed"]),
    installed: z.boolean().nullable(),
    authenticated: z.boolean().nullable(),
    online: z.boolean().nullable(),
    privateReachable: z.boolean().nullable(),
  }),
  exposure: z.object({
    state: z.enum(["unknown", "observed"]),
    public: z.object({
      origin: z.string(),
      port: z.number(),
      funnelAllowed: z.boolean().nullable(),
      routes: z.array(
        z.object({ path: z.string(), mapped: z.boolean().nullable() }),
      ),
    }),
    private: z.object({
      origin: z.string(),
      port: z.number(),
      funnelAllowed: z.boolean().nullable(),
      routes: z.array(
        z.object({ path: z.string(), mapped: z.boolean().nullable() }),
      ),
    }),
    externalReachability: z.literal("unknown"),
  }),
  supervision: z.object({
    state: z.enum(["unknown", "verified"]),
    label: z.string(),
    matchesCurrentProcess: z.boolean().nullable(),
  }),
  logs: z.object({ state: z.literal("unavailable") }),
});
