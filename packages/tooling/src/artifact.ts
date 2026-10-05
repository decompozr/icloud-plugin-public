import {z} from 'zod';
export const currentCustodyCompatibility={format:1,masterManifestFormats:[1],masterBackend:'file',accountJournal:false} as const;
const custodyCompatibilitySchema=z.object({format:z.literal(1),masterManifestFormats:z.tuple([z.literal(1)]),masterBackend:z.literal('file'),accountJournal:z.literal(false)}).strict();
export const artifactSchema=z.object({format:z.literal(1),name:z.literal('icloud-plugin'),version:z.string().regex(/^\d+\.\d+\.\d+$/),platform:z.enum(['darwin','linux']),arch:z.enum(['arm64','x64']),bun:z.string().regex(/^\d+\.\d+\.\d+$/),custodyCompatibility:custodyCompatibilitySchema.optional()}).strict();
export const packageVersionSchema=z.object({version:z.string().regex(/^\d+\.\d+\.\d+$/)});
export type Artifact=z.infer<typeof artifactSchema>;
