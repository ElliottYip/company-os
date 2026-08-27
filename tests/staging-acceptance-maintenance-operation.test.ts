import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { bindStagingAcceptanceDecision, completeStagingAcceptance,
  openStagingAcceptanceWindow } from "../scripts/staging-acceptance-maintenance-operation.ts";

const operationId = "upgrade-rc4-to-rc5";
const planDigest = `sha256:${"a".repeat(64)}`;
const recordDigest = `sha256:${"b".repeat(64)}`;
const evidenceDigest = `sha256:${"c".repeat(64)}`;

async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-acceptance-maintenance-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const evidenceDirectory = join(root, "evidence"); await mkdir(evidenceDirectory, { mode: 0o700 });
  const cookie = join(root, "session-cookie");
  await writeFile(cookie, "company_os.session=opaque-value\n", { mode: 0o600 });
  const scopeFile = join(root, "acceptance-scope.json");
  const scope = { schemaVersion: 1, product: "company-os", operationId,
    planId: "acceptance-plan-rc5", planDigest,
    authorizationReference: "acceptance:activate-rc5",
    work: [{ companyId: "company-one", workId: "acceptance-work-one" }] };
  await writeFile(scopeFile, `${JSON.stringify(scope)}\n`, { mode: 0o600 });
  return { root, evidenceDirectory, cookie, scopeFile, scope };
}

function maintenance(input: Partial<Record<string, unknown>>) {
  return { schemaVersion: 1, mode: "DISPATCH_FROZEN", revision: 4, operationId,
    authorizationReference: "change:freeze-rc5", acceptance: null,
    changedBy: "instance-admin", changedAt: "2026-08-27T13:00:00.000Z", ...input };
}

test("acceptance window opens only the exact plan and Work allowlist", async (context) => {
  const value = await fixture(context); const calls: Array<{ url: string; init: RequestInit }> = [];
  const accepting = maintenance({ mode: "ACCEPTANCE_ONLY", revision: 5,
    authorizationReference: value.scope.authorizationReference,
    acceptance: { planId: value.scope.planId, planDigest, work: value.scope.work } });
  const responses = [maintenance({}), { mode: "ACCEPTANCE_ONLY", revision: 5 }, accepting];
  const result = await openStagingAcceptanceWindow({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, activeApiLoopbackOrigin: "http://127.0.0.1:4601",
    sessionCookieFile: value.cookie, scopeFile: value.scopeFile }, {
    now: () => "2026-08-27T13:05:00.000Z",
    fetch: async (url, init = {}) => { calls.push({ url: String(url), init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 }); },
  });
  assert.equal(result.status, "ACCEPTANCE_ONLY");
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
    mode: "ACCEPTANCE_ONLY", expectedRevision: 4, operationId,
    authorizationReference: "acceptance:activate-rc5",
    acceptance: { planId: "acceptance-plan-rc5", planDigest,
      work: [{ companyId: "company-one", workId: "acceptance-work-one" }] },
  });
  const evidence = await readFile(join(value.evidenceDirectory, "acceptance-window-opened.json"), "utf8");
  assert.doesNotMatch(evidence, /opaque-value|company_os\.session/);
});

test("independent acceptance confirmation is bound before dispatch can reopen", async (context) => {
  const value = await fixture(context);
  const handoffStateFile = join(value.root, "acceptance-handoff.json");
  await writeFile(handoffStateFile, `${JSON.stringify({ schemaVersion: 1, product: "company-os",
    status: "UPGRADE_ACCEPTANCE_RECORD_BOUND_PENDING_EXTERNAL_VERIFICATION", operationId,
    acceptanceRecordDigest: recordDigest, independentlyVerified: false, dispatchReopened: false })}\n`,
  { mode: 0o600 });
  const decisionFile = join(value.root, "acceptance-decision.json");
  await writeFile(decisionFile, `${JSON.stringify({ schemaVersion: 1, product: "company-os",
    decisionId: "acceptance-decision-rc5", operationId, planId: value.scope.planId, planDigest,
    decision: "ACCEPTED", acceptanceRecordDigest: recordDigest, evidenceDigest,
    authorizationReference: "acceptance:confirmed-rc5",
    decidedAt: "2026-08-27T13:10:00.000Z", secretMaterialIncluded: false })}\n`, { mode: 0o600 });
  await assert.rejects(bindStagingAcceptanceDecision({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, scopeFile: value.scopeFile,
    handoffStateFile, decisionFile }), /STAGING_ACCEPTANCE_WINDOW_EVIDENCE_REQUIRED/);
  const referenceDigest = (reference: string) => `sha256:${createHash("sha256")
    .update(`${reference}\n`).digest("hex")}`;
  await writeFile(join(value.evidenceDirectory, "acceptance-window-opened.json"),
    `${JSON.stringify({ schemaVersion: 1, product: "company-os", operationId,
      status: "ACCEPTANCE_ONLY", planId: value.scope.planId, planDigest,
      authorizationReferenceDigest: referenceDigest(value.scope.authorizationReference) })}\n`, { mode: 0o600 });
  const bound = await bindStagingAcceptanceDecision({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, scopeFile: value.scopeFile,
    handoffStateFile, decisionFile }, { now: () => "2026-08-27T13:11:00.000Z" });
  assert.equal(bound.status, "ACCEPTANCE_CONFIRMED_DISPATCH_STILL_CLOSED");

  await assert.rejects(completeStagingAcceptance({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, activeApiLoopbackOrigin: "http://127.0.0.1:4601",
    sessionCookieFile: value.cookie,
    completionAuthorizationReference: value.scope.authorizationReference }),
  /STAGING_ACCEPTANCE_DECISION_STATE_INVALID/);

  const accepting = maintenance({ mode: "ACCEPTANCE_ONLY", revision: 5,
    authorizationReference: value.scope.authorizationReference,
    acceptance: { planId: value.scope.planId, planDigest, work: value.scope.work } });
  const responses = [accepting, { mode: "OPEN", revision: 6 }, maintenance({ mode: "OPEN", revision: 6,
    authorizationReference: "dispatch:reopen-rc5", acceptance: null })];
  const calls: Array<{ init: RequestInit }> = [];
  const completed = await completeStagingAcceptance({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, activeApiLoopbackOrigin: "http://127.0.0.1:4601",
    sessionCookieFile: value.cookie, completionAuthorizationReference: "dispatch:reopen-rc5" }, {
    now: () => "2026-08-27T13:12:00.000Z",
    fetch: async (_url, init = {}) => { calls.push({ init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 }); },
  });
  assert.equal(completed.status, "DISPATCH_REOPENED_AFTER_ACCEPTANCE");
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), { mode: "OPEN", expectedRevision: 5,
    operationId, authorizationReference: "dispatch:reopen-rc5" });
  const evidence = await readFile(join(value.evidenceDirectory, "dispatch-reopened.json"), "utf8");
  assert.match(evidence, /acceptance-decision-rc5/);
  assert.doesNotMatch(evidence, /opaque-value|company_os\.session/);
});

test("dispatch reopen rejects an unconfirmed decision", async (context) => {
  const value = await fixture(context);
  await assert.rejects(completeStagingAcceptance({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, activeApiLoopbackOrigin: "http://127.0.0.1:4601",
    sessionCookieFile: value.cookie, completionAuthorizationReference: "acceptance:activate-rc5" }),
  /STAGING_ACCEPTANCE_DECISION_REQUIRED/);
});

test("a rejected acceptance decision keeps dispatch frozen", async (context) => {
  const value = await fixture(context);
  const activationDigest = `sha256:${createHash("sha256")
    .update(`${value.scope.authorizationReference}\n`).digest("hex")}`;
  const confirmationDigest = `sha256:${createHash("sha256")
    .update("acceptance:rejected-rc5\n").digest("hex")}`;
  await writeFile(join(value.evidenceDirectory, "acceptance-decision-bound.json"),
    `${JSON.stringify({ schemaVersion: 1, product: "company-os",
      status: "ACCEPTANCE_CONFIRMED_DISPATCH_STILL_CLOSED",
      operationId, planId: value.scope.planId, planDigest,
      decisionId: "acceptance-decision-rejected-rc5", decision: "REJECTED",
      acceptanceRecordDigest: recordDigest, externalEvidenceDigest: evidenceDigest,
      handoffStateDigest: `sha256:${"d".repeat(64)}`,
      acceptanceWindowEvidenceDigest: `sha256:${"e".repeat(64)}`,
      sourceDecisionDigest: `sha256:${"f".repeat(64)}`,
      activationAuthorizationReferenceDigest: activationDigest,
      verificationAuthorizationReferenceDigest: confirmationDigest,
      decidedAt: "2026-08-27T13:14:00.000Z", boundAt: "2026-08-27T13:14:30.000Z",
      independentlyVerified: true, dispatchReopened: false,
      customerRecordIncluded: false, secretMaterialIncluded: false })}\n`, { mode: 0o600 });
  const accepting = maintenance({ mode: "ACCEPTANCE_ONLY", revision: 5,
    authorizationReference: value.scope.authorizationReference,
    acceptance: { planId: value.scope.planId, planDigest, work: value.scope.work } });
  const rejected = maintenance({ mode: "DISPATCH_FROZEN", revision: 6,
    authorizationReference: "dispatch:reject-rc5", acceptance: null });
  const responses = [accepting, { mode: "DISPATCH_FROZEN", revision: 6 }, rejected];
  const calls: Array<{ init: RequestInit }> = [];
  const completed = await completeStagingAcceptance({ rootDirectory: value.root,
    evidenceDirectory: value.evidenceDirectory, activeApiLoopbackOrigin: "http://127.0.0.1:4601",
    sessionCookieFile: value.cookie, completionAuthorizationReference: "dispatch:reject-rc5" }, {
    now: () => "2026-08-27T13:15:00.000Z",
    fetch: async (_url, init = {}) => { calls.push({ init });
      return new Response(JSON.stringify(responses.shift()), { status: 200 }); },
  });
  assert.equal(completed.status, "ACCEPTANCE_REJECTED_DISPATCH_FROZEN");
  assert.deepEqual(JSON.parse(String(calls[1]?.init.body)), {
    mode: "DISPATCH_FROZEN", expectedRevision: 5, operationId,
    authorizationReference: "dispatch:reject-rc5",
  });
  const evidence = await readFile(join(value.evidenceDirectory, "acceptance-rejected.json"), "utf8");
  assert.match(evidence, /acceptance-decision-rejected-rc5/);
  assert.doesNotMatch(evidence, /opaque-value|company_os\.session/);
});
