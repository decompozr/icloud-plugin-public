import type { Photo, Resource } from "./photos";

// A checksum match is a review lead, not proof that either asset is disposable.
// Edits, album membership, metadata and unrepresented resources may differ.
export function cleanupCandidates(photos: readonly Photo[], coverage: { complete: boolean }) {
  const buckets = new Map<string, Photo[]>();
  const seen = new Set<string>();
  let comparable = 0;
  for (const photo of photos) {
    if (seen.has(photo.id)) throw new Error("repeated scoped photo ID");
    seen.add(photo.id);
    const original = signature(photo.resources.original);
    const motion = photo.resources.livePhotoMotion;
    const motionSignature = motion ? signature(motion) : null;
    if (!original || (motion && !motionSignature)) continue;
    comparable++;
    const scope = [photo.library.database, Object.entries(photo.library.zoneID).sort(([a], [b]) => a.localeCompare(b))];
    const key = JSON.stringify([scope, original, motionSignature]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(photo);
    buckets.set(key, bucket);
  }
  const groups = [...buckets.values()].filter(group => group.length > 1).map(group => {
    const members = group.map(photo => ({
      id: photo.id,
      filename: photo.filename,
      assetDate: photo.assetDate,
      thumbnailAvailable: Boolean(photo.resources.thumbnail),
    })).sort((a, b) => a.id.localeCompare(b.id));
    return {
      id: JSON.stringify(members.map(member => member.id)),
      reason: "matching-original-resource-checksums" as const,
      motionCompared: Boolean(group[0]!.resources.livePhotoMotion),
      reviewRequired: true as const,
      members,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return {
    status: "review-candidates-only" as const,
    coverage: { inputComplete: coverage.complete, photosExamined: photos.length, comparable, skipped: photos.length - comparable },
    groups,
    // No URL/token/checksum output; a trusted caller resolves IDs for previews.
    notAssessed: ["visual-similarity", "blur", "expiry", "app-origin", "personal-value", "edits", "album-membership"] as const,
    deletionAuthorized: false as const,
  };
}

function signature(resource: Resource | undefined): [string, number, string] | null {
  if (!resource || !Number.isSafeInteger(resource.size) || resource.size <= 0 || !resource.fileChecksum.trim() || !resource.fileType.trim()) return null;
  return [resource.fileChecksum, resource.size, resource.fileType];
}
