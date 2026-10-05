import { expect, test } from "bun:test";
import { cleanupCandidates } from "./cleanup-candidates";
import { library, pair } from "./fixture";
import { parsePage } from "./photos";

function photo(name: string, motion = false) {
  return parsePage({ records: pair(name, true, motion) }, library)[0]!;
}

test("parsed fixture resources create stable review leads without signed URLs or a delete decision", () => {
  const a = photo("a"), b = photo("b");
  b.resources.original = { ...a.resources.original!, downloadURL: "https://photos.invalid/secret-token" };
  const report = cleanupCandidates([a, b], { complete: false });
  expect(report.groups).toHaveLength(1);
  expect(report.groups[0]!.members.map(member => member.id)).toEqual([a.id, b.id]);
  expect(report.groups[0]!.reviewRequired).toBe(true);
  expect(report.coverage).toEqual({ inputComplete: false, photosExamined: 2, comparable: 2, skipped: 0 });
  expect(report.deletionAuthorized).toBe(false);
  expect(JSON.stringify(report)).not.toContain("secret-token");
  expect(JSON.stringify(report)).not.toContain(a.resources.original!.fileChecksum);
  expect(cleanupCandidates([b, a], { complete: false })).toEqual(report);
});

test("thumbnail collisions and filename collisions do not make original matches", () => {
  const a = photo("a"), b = photo("b");
  b.resources.thumbnail = a.resources.thumbnail;
  expect(cleanupCandidates([a, b], { complete: true }).groups).toEqual([]);
});

test("Live Photo motion must also match; stills and Live Photos stay separate", () => {
  const a = photo("a", true), b = photo("b", true), still = photo("still");
  b.resources.original = still.resources.original = a.resources.original;
  expect(cleanupCandidates([a, b, still], { complete: true }).groups).toEqual([]);
  b.resources.livePhotoMotion = a.resources.livePhotoMotion;
  const report = cleanupCandidates([a, b, still], { complete: true });
  expect(report.groups).toHaveLength(1);
  expect(report.groups[0]!.motionCompared).toBe(true);
  expect(report.groups[0]!.members).toHaveLength(2);
});

test("scopes, types and sizes prevent unsafe cross-library or partial matches", () => {
  const a = photo("a"), b = photo("b");
  b.resources.original = { ...a.resources.original! };
  b.library = { ...library, database: "shared" };
  expect(cleanupCandidates([a, b], { complete: true }).groups).toEqual([]);
  b.library = library;
  b.resources.original.size++;
  expect(cleanupCandidates([a, b], { complete: true }).groups).toEqual([]);
  b.resources.original.size--;
  b.resources.original.fileType = "different";
  expect(cleanupCandidates([a, b], { complete: true }).groups).toEqual([]);
});

test("incomplete resources are counted as skipped and repeated observations cannot make duplicates", () => {
  const a = photo("a"), b = photo("b"), c = photo("c", true);
  delete a.resources.original;
  b.resources.original!.fileChecksum = " ";
  c.resources.livePhotoMotion!.size = 0;
  expect(cleanupCandidates([a, b, c], { complete: false }).coverage.skipped).toBe(3);
  expect(() => cleanupCandidates([b, b], { complete: false })).toThrow("repeated scoped photo ID");
});
