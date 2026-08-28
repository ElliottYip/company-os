import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const [apiOrigin, browserOrigin, outputPath] = process.argv.slice(2);
if (!apiOrigin || !browserOrigin || !outputPath) {
  throw new Error(
    "USAGE: node scripts/create-public-demo-recovery-fixture.mjs <api-origin> <browser-origin> <new-token-file>",
  );
}

const created = await fetch(`${apiOrigin}/api/demo/v2/sessions`, {
  method: "POST",
  headers: { origin: browserOrigin },
});
assert.equal(created.status, 201);
const setCookie = created.headers.get("set-cookie");
assert.match(setCookie ?? "", /^company-os-demo-session=/);
const token = setCookie.split(";", 1)[0].slice("company-os-demo-session=".length);
assert.match(token, /^[A-Za-z0-9_-]{32,160}$/);
await writeFile(outputPath, token, { encoding: "utf8", mode: 0o600, flag: "wx" });

console.log(JSON.stringify({
  status: "RECOVERY_FIXTURE_CREATED",
  tokenStoredLocally: true,
  tokenDisclosed: false,
}));
