import { ProbeError, type ProbeStage } from "./probe-diagnostics";
// Bounded direct-HTTP experiment; icloudpd 879c561 services/photos.py.
import { parsePage, query, type Library, type Photo } from './photos';
import { decodeCloudMetadata } from './cloud-metadata';

export interface CloudSession {
  dsid: string;
  clientId?: string;
  webservices: Record<string, { url: string }>;
  request(url: string | URL, init?: RequestInit): Promise<Response>;
}
export const CLOUD_READ_LIMITS = { maxPages: 2, maxItems: 20, maxBytes: 2 * 1024 * 1024, timeoutMs: 30000 } as const;
export function photosEndpoint(session: CloudSession): URL {
  const raw = session.webservices.ckdatabasews?.url;
  if (!raw) throw new ProbeError('photos_service_missing');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !/^(?:p\d+-)?ckdatabasews\.icloud\.com$/.test(url.hostname) || url.port || url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) throw new Error('Untrusted Photos service destination');
  if (!/^\d+$/.test(session.dsid)) throw new Error('Invalid account discovery');
  url.pathname = '/database/1/com.apple.photos.cloud/production/private/records/query';
  url.search = new URLSearchParams({ dsid: session.dsid, clientBuildNumber: '2522Project44', clientMasteringNumber: '2522B2', clientId: session.clientId ?? crypto.randomUUID(), remapEnums: 'true', getCurrentSyncToken: 'true' }).toString();
  return url;
}
export const primaryLibrary: Library = { database: 'private', zoneID: { zoneName: 'PrimarySync' } };
export function responseLibrary(payload: any, requested: Library, firstPage: boolean): Library {
  // The initial private-zone request omits its owner. Apple returns the full
  // zone identity; bind it once and keep that identity for all subsequent pages.
  if (!Array.isArray(payload?.records)) throw new ProbeError('photos_response_invalid');
  const zone = payload.records.find((record: any) => record?.zoneID !== undefined)?.zoneID;
  if (zone === undefined) return requested;
  if (!zone || typeof zone !== 'object' || Array.isArray(zone) ||
      Object.entries(zone).some(([key,value]) => !['zoneName','ownerRecordName','zoneType'].includes(key) || typeof value !== 'string' || !value.length) ||
      Object.entries(requested.zoneID).some(([key,value]) => zone[key] !== value) ||
      (!firstPage && Object.keys(zone).length !== Object.keys(requested.zoneID).length)) throw new ProbeError('photos_zone_mismatch');
  return {database: requested.database, zoneID: Object.fromEntries(Object.keys(zone).sort().map(key=>[key,zone[key]]))};
}
export function cloudTransport(session: CloudSession, operation: 'records/query' | 'changes/zone' = 'records/query') {
  if (!['records/query', 'changes/zone'].includes(operation)) throw new Error('Unsupported Photos operation');
  const endpoint = photosEndpoint(session);
  endpoint.pathname = endpoint.pathname.replace(/records\/query$/, operation);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLOUD_READ_LIMITS.timeoutMs);
  let responseBytes = 0;
  async function post(body: unknown): Promise<any> {
    const response = await session.request(endpoint, { method: 'POST', redirect: 'manual', signal: controller.signal, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    if (!response.ok || response.redirected) { await response.body?.cancel(); throw new ProbeError('photos_http_rejected', response.status); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing Photos response');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        responseBytes += part.value.byteLength;
        if (responseBytes > CLOUD_READ_LIMITS.maxBytes) throw new Error('Photos response byte limit');
        chunks.push(part.value); length += part.value.byteLength;
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  return { post, get responseBytes() { return responseBytes; }, close() { clearTimeout(timer); controller.abort(); } };
}
export async function readCloudPhotos(session: CloudSession, albumRecordName?: string, onStage?: (stage: ProbeStage) => void, startRank=0) {
  onStage?.('service-discovery');
  if(!Number.isSafeInteger(startRank)||startRank<0)throw new Error('Invalid start rank');
  if (albumRecordName !== undefined && (!albumRecordName.trim() || albumRecordName.length > 512 || /[\x00-\x1f]/.test(albumRecordName))) throw new Error('Invalid exact album record identity');
  const transport = cloudTransport(session);
  const { post } = transport;
  let library = primaryLibrary;
  let pages = 0;
  const photos: Photo[] = [];
  const metadata: ReturnType<typeof decodeCloudMetadata>[] = [];
  const seen = new Set<string>();
  try {
    onStage?.('photos-indexing');
    const indexing = await post({ query: { recordType: 'CheckIndexingState' }, zoneID: library.zoneID });
    if (indexing?.records?.[0]?.fields?.state?.value !== 'FINISHED') throw new ProbeError('photos_indexing_not_ready');
    onStage?.('photos-read');
    while (pages < CLOUD_READ_LIMITS.maxPages && photos.length < CLOUD_READ_LIMITS.maxItems) {
      const pageSize = Math.min(10, CLOUD_READ_LIMITS.maxItems - photos.length);
      const body = query(library, startRank+photos.length, pageSize);
      body.desiredKeys.push('keywordsEnc', 'captionEnc', 'locationEnc');
      if (albumRecordName !== undefined) {
        body.query.recordType = 'CPLContainerRelationLiveByAssetDate';
        body.query.filterBy.push({ fieldName: 'parentId', comparator: 'EQUALS', fieldValue: { type: 'STRING', value: albumRecordName } });
      }
      const payload = await post(body);
      pages++;
      library = responseLibrary(payload, library, pages === 1);
      let page: Photo[];
      try { page = parsePage(payload, library); }
      catch { throw new ProbeError('photos_response_invalid'); }
      if (page.length > pageSize) throw new Error('Photos page exceeds item limit');
      if (!page.length) return { photos, metadata, pages, responseBytes: transport.responseBytes, complete: true, stoppedBy: 'empty-page' as const };
      for (const photo of page) {
        if (seen.has(photo.id)) throw new Error('Repeated cloud asset');
        seen.add(photo.id); photos.push(photo);
      }
      for (const record of payload.records) if (record.recordType === 'CPLAsset') {
        try { metadata.push(decodeCloudMetadata(record, library)); }
        catch { throw new ProbeError('photos_response_invalid'); }
      }
    }
    return { photos, metadata, pages, responseBytes: transport.responseBytes, complete: false, stoppedBy: photos.length >= CLOUD_READ_LIMITS.maxItems ? 'item-cap' as const : 'page-cap' as const };
  } finally { transport.close(); }
}

// Never print raw records, filenames, identifiers, metadata values or signed URLs.
export function cloudEvidence(result: Awaited<ReturnType<typeof readCloudPhotos>>) {
  return { source: 'direct-icloud-http', photosRead: result.photos.length, pages: result.pages, responseBytes: result.responseBytes, complete: result.complete, stoppedBy: result.stoppedBy,
    keywordsPresent: result.metadata.filter(x => x.userKeywords.state === 'present').length,
    captionsPresent: result.metadata.filter(x => x.caption.state === 'present').length,
    gpsPresent: result.metadata.filter(x => x.gps.state === 'present').length,
    invalidMetadataFields: result.metadata.reduce((n,x) => n + [x.userKeywords,x.caption,x.gps].filter(f=>f.state==='invalid').length,0),
    peopleSearchVerified: false, generatedLabelsVerified: false, placeNamesVerified: false };
}
