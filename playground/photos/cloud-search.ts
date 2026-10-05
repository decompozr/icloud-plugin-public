/** Handwritten Photos search wire codec, not an authenticated transport.
 * Apple photos3/2636Build18/en-us/search.js and ui.main.js.
 * Results refer to existing metadata; this module performs no face recognition.
 */
export type SearchResult = { id: string; type: string };
const invalid = () => new Error('invalid_search_payload');
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16384;

export function createPhotoSearchRequest(query: string, timestamp = Date.now()) {
  if (!text(query) || !query.trim() || query.length > 1024 || !Number.isSafeInteger(timestamp) || timestamp < 0) throw invalid();
  // Preserve the user's name/query. Apple performs matching, not an exact local name filter.
  return { photos: { search: { string: query.trim(), assetsLimit: 5001, collectionsLimit: 2001, clientTimestamp: timestamp } } };
}

/** Parse one resultsFound chunk. Transport completion must be checked separately. */
export function parsePhotoSearchResults(value: unknown): {
  results: SearchResult[]; recommendedResults: SearchResult[];
  totalAssetCount: number; totalCollectionCount: number;
} {
  if (!object(value)) throw invalid();
  const count = (v: unknown): number => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw invalid();
    return v;
  };
  const results = (v: unknown): SearchResult[] => {
    if (!Array.isArray(v) || v.length > 10000) throw invalid();
    return v.map(item => {
      if (text(item)) return { id: item, type: '1' };
      if (!object(item) || !text(item.id) || !text(item.type)) throw invalid();
      // Preserve unknown future types; callers must explicitly select type 1 for assets.
      return { id: item.id, type: item.type };
    });
  };
  return {
    results: results(value.results),
    recommendedResults: value.recommendedResults === undefined ? [] : results(value.recommendedResults),
    totalAssetCount: count(value.totalAssetCount),
    totalCollectionCount: count(value.totalCollectionCount),
  };
}
