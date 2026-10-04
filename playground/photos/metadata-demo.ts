import { parseMetadata } from "./metadata";
console.log(JSON.stringify({ fixture: "synthetic; no real photo library read", ...parseMetadata(JSON.stringify([
  { uuid: "invented-1", persons: ["Example Person"], keywords: ["holiday"], labels: ["Beach"], latitude: 0, longitude: 0, place: { name: "Invented Place", names: { city: ["Invented Place"] }, country_code: "ZZ" } },
  { uuid: "invented-2", persons: [], keywords: [], labels: [], latitude: null, longitude: null, place: null },
  { uuid: "invented-3" },
  { uuid: "invented-4", persons: "bad list", latitude: 91, longitude: 0 },
]), "synthetic-library") }, null, 2));
