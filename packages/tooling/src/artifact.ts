import {z} from 'zod';
export const artifactSchema=z.object({format:z.literal(1),name:z.literal('icloud-plugin'),version:z.string().regex(/^\d+\.\d+\.\d+$/),platform:z.enum(['darwin','linux']),arch:z.enum(['arm64','x64']),bun:z.string().regex(/^\d+\.\d+\.\d+$/)}).strict();
export const packageVersionSchema=z.object({version:z.string().regex(/^\d+\.\d+\.\d+$/)});
export type Artifact=z.infer<typeof artifactSchema>;
