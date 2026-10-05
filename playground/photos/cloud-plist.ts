// Bounded subset of Apple plists used by icloudpd's cloud metadata decoder.
// Parsing libraries handle the wire format; preflight prevents pathological input.
import { parseBuffer } from "bplist-parser";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export const PLIST_LIMITS = { bytes: 65536, objects: 4096, expandedBytes: 262144, visits: 8192, depth: 32 } as const;
const invalid = (): never => { throw new Error("unsupported or malformed bounded plist"); };
const unsafeKey = (s: string) => ["__proto__", "prototype", "constructor"].includes(s);

function checkBinary(data: Buffer): void {
  if (data.length < 40) invalid();
  const trailer = data.length - 32;
  const uint = (offset: number, width: number, end: number): number => {
    if (![1, 2, 4, 8].includes(width) || offset < 0 || offset + width > end) invalid();
    let value = 0n;
    for (let i = 0; i < width; i++) value = (value << 8n) | BigInt(data[offset + i]!);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
    return Number(value);
  };
  const offsetWidth = data[trailer + 6]!, refWidth = data[trailer + 7]!;
  if (![1, 2, 4, 8].includes(refWidth)) invalid();
  const count = uint(trailer + 8, 8, data.length), top = uint(trailer + 16, 8, data.length);
  const table = uint(trailer + 24, 8, data.length);
  if (!count || count > PLIST_LIMITS.objects || top >= count || table < 8 || table + count * offsetWidth !== trailer) invalid();
  const offsets = Array.from({ length: count }, (_, i) => uint(table + i * offsetWidth, offsetWidth, trailer));
  if (new Set(offsets).size !== count || offsets.some(x => x < 8 || x >= table)) invalid();
  const sorted = [...offsets].sort((a, b) => a - b);
  const ends = new Map(sorted.map((x, i) => [x, sorted[i + 1] ?? table]));
  const active = new Set<number>();
  let visits = 0, expandedBytes = 0;
  function walk(index: number, depth: number): string | undefined {
    if (index >= count || depth > PLIST_LIMITS.depth || ++visits > PLIST_LIMITS.visits || active.has(index)) invalid();
    active.add(index);
    let pos = offsets[index]!;
    const end = ends.get(pos)!;
    const marker = data[pos++]!, type = marker >> 4;
    let size = marker & 15;
    const need = (length: number) => { if (!Number.isSafeInteger(length) || length < 0 || pos + length > end || (expandedBytes += length) > PLIST_LIMITS.expandedBytes) invalid(); };
    if ([4, 5, 6, 10, 13].includes(type) && size === 15) {
      need(1);
      const m = data[pos++]!;
      if (m >> 4 !== 1 || (m & 15) > 3) invalid();
      const width = 2 ** (m & 15);
      size = uint(pos, width, end); pos += width;
    }
    let str: string | undefined;
    if (type === 0) { if (![0, 8, 9].includes(marker)) invalid(); }
    else if (type === 1) { if (size > 3) invalid(); need(2 ** size); }
    else if (type === 2) { if (![2, 3].includes(size)) invalid(); need(2 ** size); }
    else if (type === 3) { if (size !== 3) invalid(); need(8); }
    else if (type === 4) need(size);
    else if (type === 5 || type === 6) {
      need(size * (type === 6 ? 2 : 1));
      const raw = data.subarray(pos, pos + size * (type === 6 ? 2 : 1));
      if (type === 5 && raw.some(x => x > 127)) invalid();
      str = new TextDecoder(type === 6 ? "utf-16be" : "utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
    } else if (type === 10 || type === 13) {
      if (size > PLIST_LIMITS.objects) invalid();
      need(size * refWidth * (type === 13 ? 2 : 1));
      const keys = new Set<string>();
      for (let i = 0; i < size; i++) {
        const value = walk(uint(pos + i * refWidth, refWidth, end), depth + 1);
        if (type === 13) {
          if (value === undefined || unsafeKey(value) || keys.has(value)) invalid();
          keys.add(value);
          walk(uint(pos + (size + i) * refWidth, refWidth, end), depth + 1);
        }
      }
    } else invalid(); // UID, sets and keyed archives are outside this metadata format.
    active.delete(index);
    return str;
  }
  walk(top, 0);
}

function decodeXML(data: Uint8Array): unknown {
  let xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(xml)) invalid();
  // Only Apple's conventional external declaration is accepted; no DTD is loaded.
  xml = xml.replace(/<!DOCTYPE plist PUBLIC "-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN" "http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd">/, "");
  if (/<!|&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(xml)) invalid();
  // Bound depth before either validator or parser sees nested markup.
  let depth = 0, nodes = 0;
  for (const match of xml.matchAll(/<[^>]*>/g)) {
    const tag = match[0];
    if (tag.startsWith("<?")) {
      if (!/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>$/i.test(tag)) invalid();
      continue;
    }
    if (tag.startsWith("</")) depth--;
    else {
      if (++nodes > PLIST_LIMITS.objects) invalid();
      if (!tag.endsWith("/>")) depth++;
    }
    if (depth < 0 || depth > PLIST_LIMITS.depth) invalid();
  }
  if (depth || XMLValidator.validate(xml) !== true) invalid();
  const tree = new XMLParser({ preserveOrder: true, ignoreAttributes: false, ignoreDeclaration: true, trimValues: false, parseTagValue: false, processEntities: false }).parse(xml);
  const children = (value: any[]): any[] => value.filter(n => !("#text" in n && /^\s*$/.test(n["#text"])));
  function convert(node: any, allowKey = false, allowRoot = false): unknown {
    const names = Object.keys(node).filter(k => k !== ":@");
    if (names.length !== 1) invalid();
    const name = names[0]!, content = node[name];
    if (!Array.isArray(content)) invalid();
    if (node[":@"] && !(name === "plist" && Object.keys(node[":@"]).length === 1 && node[":@"]["@_version"] === "1.0")) invalid();
    const kids = children(content);
    if (name === "plist") { if (!allowRoot || kids.length !== 1) invalid(); return convert(kids[0]); }
    if (name === "array") return kids.map(n => convert(n));
    if (name === "dict") {
      if (kids.length % 2) invalid();
      const result: Record<string, unknown> = Object.create(null);
      for (let i = 0; i < kids.length; i += 2) {
        if (!("key" in kids[i])) invalid();
        const key = convert(kids[i], true);
        if (typeof key !== "string" || unsafeKey(key) || Object.hasOwn(result, key) || "key" in kids[i + 1]) invalid();
        result[key] = convert(kids[i + 1]);
      }
      return result;
    }
    if (content.some(n => Object.keys(n).length !== 1 || !("#text" in n))) invalid();
    const value = content.map(n => n["#text"]).join("").replace(/&([^;]+);/g, (_: string, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: String.fromCharCode(34), apos: String.fromCharCode(39) };
      if (Object.hasOwn(named, entity)) return named[entity]!;
      const cp = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (![9, 10, 13].includes(cp) && !(cp >= 32 && cp <= 0xd7ff) && !(cp >= 0xe000 && cp <= 0xfffd) && !(cp >= 0x10000 && cp <= 0x10ffff)) invalid();
      return String.fromCodePoint(cp);
    });
    if (name === "key" && !allowKey) invalid();
    if (name === "key" || name === "string") return value;
    if (name === "true" || name === "false") { if (value.trim()) invalid(); return name === "true"; }
    if (name === "integer") { if (!/^[+-]?\d+$/.test(value.trim())) invalid(); const n = Number(value); if (!Number.isSafeInteger(n)) invalid(); return n; }
    if (name === "real") { if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) invalid(); const n = Number(value); if (!Number.isFinite(n)) invalid(); return n; }
    if (name === "date") { if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) || !Number.isFinite(Date.parse(value))) invalid(); return new Date(value); }
    invalid();
  }
  const roots = children(tree);
  if (roots.length !== 1 || !("plist" in roots[0])) invalid();
  return convert(roots[0], false, true);
}

export function decodePlist(input: Uint8Array): unknown {
  if (!input.length || input.length > PLIST_LIMITS.bytes) invalid();
  const data = Buffer.from(input);
  if (data.subarray(0, 8).toString("ascii") === "bplist00") {
    checkBinary(data);
    return parseBuffer(data)[0];
  }
  return decodeXML(data);
}
