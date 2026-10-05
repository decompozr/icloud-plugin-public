import fixtures from "./cloud-fixtures.json";
import { decodeCloudMetadata } from "./cloud-metadata";
console.log(JSON.stringify({ source: "synthetic wire-format fixtures encoded by Python plistlib; no cloud/local-library access", photos: [fixtures.binary, fixtures.xml].map(r => decodeCloudMetadata(r, { database: "private", zoneID: { zoneName: "synthetic-zone" } })) }, null, 2));
