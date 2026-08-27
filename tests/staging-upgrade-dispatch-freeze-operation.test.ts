import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeDispatchFreezeOperation } from
  "../scripts/staging-upgrade-dispatch-freeze-operation.ts";

const operationId = "upgrade-rc4-to-rc5"; const authorizationReference = "change:upgrade-preparation-01";
function maintenance(input: Partial<Record<string, unknown>> = {}) {
  return { schemaVersion: 1, mode: "OPEN", revision: 4, operationId: null,
    authorizationReference: null, changedBy: null, changedAt: null, ...input };
}
async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-dispatch-freeze-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); await mkdir(candidate, { mode: 0o700 });
  const cookie = join(root, "session-cookie"); await writeFile(cookie, "company_os.session=opaque-value\n", { mode: 0o600 });
  return { candidate, cookie };
}

test("dispatch freeze uses optimistic revision and confirms the exact operation", async (context) => {
  const { candidate, cookie } = await fixture(context); const calls: Array<{ url: string; init: RequestInit }> = [];
  const responses = [maintenance(), { mode: "DISPATCH_FROZEN", revision: 5 },
    maintenance({ mode: "DISPATCH_FROZEN", revision: 5, operationId, authorizationReference,
      changedBy: "human-admin", changedAt: "2026-08-27T12:00:00.000Z" })];
  const operation = await createStagingUpgradeDispatchFreezeOperation({ candidateDirectory: candidate,
    operationId, siteId: "company-os-test-site", candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeApiLoopbackOrigin: "http://127.0.0.1:4601", authorizationReference,
    sessionCookieFile: cookie }, { now: () => "2026-08-27T12:00:00.000Z",
    fetch: async (url, init = {}) => { calls.push({ url: String(url), init });
      return new Response(JSON.stringify(responses.shift()), { status: 200,
        headers: { "content-type": "application/json" } }); } });
  const result = await operation();
  assert.equal(result.outcome, "NEW_DISPATCH_DISABLED");
  assert.equal(calls[1].init.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { mode: "DISPATCH_FROZEN", expectedRevision: 4,
    operationId, authorizationReference });
  const evidence = await readFile(join(candidate, "step-evidence", "freeze-dispatch.json"), "utf8");
  assert.doesNotMatch(evidence, /opaque-value|company_os\.session/);
  assert.equal(JSON.parse(evidence).frozenRevision, 5);
});

test("dispatch freeze is idempotent only for the same operation and authority", async (context) => {
  const { candidate, cookie } = await fixture(context); let calls = 0;
  const same = maintenance({ mode: "DISPATCH_FROZEN", revision: 7, operationId, authorizationReference,
    changedBy: "human-admin", changedAt: "2026-08-27T12:00:00.000Z" });
  const operation = await createStagingUpgradeDispatchFreezeOperation({ candidateDirectory: candidate,
    operationId, siteId: "company-os-test-site", candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeApiLoopbackOrigin: "http://127.0.0.1:4601", authorizationReference,
    sessionCookieFile: cookie }, { fetch: async () => { calls += 1;
      return new Response(JSON.stringify(same), { status: 200 }); } });
  await operation(); assert.equal(calls, 2);

  const otherRoot = await fixture(context); const conflict = maintenance({ mode: "DISPATCH_FROZEN",
    revision: 8, operationId: "upgrade-other", authorizationReference: "change:other",
    changedBy: "human-other", changedAt: "2026-08-27T12:00:00.000Z" });
  const other = await createStagingUpgradeDispatchFreezeOperation({ candidateDirectory: otherRoot.candidate,
    operationId, siteId: "company-os-test-site", candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeApiLoopbackOrigin: "http://127.0.0.1:4601", authorizationReference,
    sessionCookieFile: otherRoot.cookie }, { fetch: async () => new Response(JSON.stringify(conflict), { status: 200 }) });
  await assert.rejects(other(), /STAGING_UPGRADE_DISPATCH_ALREADY_FROZEN_BY_OTHER_OPERATION/);
});

test("dispatch freeze rejects public origins and unsafe session files", async (context) => {
  const { candidate, cookie } = await fixture(context);
  await assert.rejects(createStagingUpgradeDispatchFreezeOperation({ candidateDirectory: candidate,
    operationId, siteId: "company-os-test-site", candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeApiLoopbackOrigin: "https://api.example.com", authorizationReference,
    sessionCookieFile: cookie }), /STAGING_UPGRADE_DISPATCH_ACTIVE_ORIGIN_INVALID/);
  await writeFile(cookie, "bad\nheader=value\n", { mode: 0o600 });
  await assert.rejects(createStagingUpgradeDispatchFreezeOperation({ candidateDirectory: candidate,
    operationId, siteId: "company-os-test-site", candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    activeApiLoopbackOrigin: "http://127.0.0.1:4601", authorizationReference,
    sessionCookieFile: cookie }), /STAGING_UPGRADE_DISPATCH_SESSION_INVALID/);
});
