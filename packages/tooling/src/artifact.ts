import {homeKitPayloadSchema} from './homekit-payload.js';
import {serviceAppSchema} from './service-app.js';
import {z} from 'zod';
export const artifactSchema=z.object({format:z.literal(1),name:z.literal('icloud-plugin'),version:z.string().regex(/^\d+\.\d+\.\d+$/),platform:z.enum(['darwin','linux']),arch:z.enum(['arm64','x64']),bun:z.string().regex(/^\d+\.\d+\.\d+$/),homekit:homeKitPayloadSchema.optional(),serviceApp:serviceAppSchema.optional()}).strict().refine(v=>(!v.homekit&&!v.serviceApp)||v.platform==='darwin','Native apps require macOS artifact');
export const packageVersionSchema=z.object({version:z.string().regex(/^\d+\.\d+\.\d+$/)});
export type Artifact=z.infer<typeof artifactSchema>;
