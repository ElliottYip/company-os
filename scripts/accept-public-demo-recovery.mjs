import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [apiOrigin, browserOrigin, cookieJarPath] = process.argv.slice(2);
if (!apiOrigin || !browserOrigin || !cookieJarPath) {
  throw new Error(
    "USAGE: node scripts/accept-public-demo-recovery.mjs <api-origin> <browser-origin> <token-file>",
  );
}

const priorToken = (await readFile(cookieJarPath, "utf8")).trim();
assert.match(priorToken ?? "", /^[A-Za-z0-9_-]{32,160}$/);
const priorCookie = `company-os-demo-session=${priorToken}`;

const missing = await fetch(`${apiOrigin}/api/demo/v2/session`, {
  headers: { cookie: priorCookie },
});
assert.equal(missing.status, 401);
assert.equal((await missing.json()).error.code, "DEMO_SESSION_NOT_FOUND");

const recovered = await fetch(`${apiOrigin}/api/demo/v2/recover`, {
  method: "POST",
  headers: { cookie: priorCookie, origin: browserOrigin },
});
assert.equal(recovered.status, 200);
const nextSetCookie = recovered.headers.get("set-cookie");
assert.match(nextSetCookie ?? "", /^company-os-demo-session=/);
assert.notEqual(nextSetCookie.split(";")[0], priorCookie);
const snapshot = await recovered.json();
assert.equal("sessionId" in snapshot, false);
assert.equal(snapshot.generation, 1);
assert.equal(snapshot.provenance, "DEMO_FIXTURE");

const current = await fetch(`${apiOrigin}/api/demo/v2/session`, {
  headers: { cookie: nextSetCookie.split(";")[0] },
});
assert.equal(current.status, 200);
assert.equal((await current.json()).company.name, "Coral Labs · Demo Fixture");

console.log(JSON.stringify({
  status: "PASSED",
  oldSessionAfterRestart: "FAIL_CLOSED_NOT_FOUND",
  recovery: "NEW_ISOLATED_DEMO_FIXTURE",
  tokenDisclosed: false,
}, null, 2));
