import { library, startFixture } from "./fixture";
import { readLoopback } from "./photos";

const { server, requests } = startFixture();
try {
  const result = await readLoopback(server.port!, library);
  console.log(JSON.stringify({
    source: "synthetic loopback fixture; no iCloud access",
    ...result,
    photos: result.photos.map(({ assetRecordName, masterRecordName, filename, resources }) => ({
      assetRecordName, masterRecordName, filename, availableRenditions: Object.keys(resources),
    })),
    requests,
  }, null, 2));
} finally { await server.stop(true); }
