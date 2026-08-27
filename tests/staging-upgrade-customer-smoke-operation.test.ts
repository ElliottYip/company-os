import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createStagingUpgradeCustomerSmokeOperation } from
  "../scripts/staging-upgrade-customer-smoke-operation.ts";

const ids = { companyId: "company-smoke", workId: "work-smoke", attemptId: "attempt-smoke",
  accountableHumanId: "human-smoke", executingAgentId: "agent-smoke",
  responsibilityContractId: "contract-smoke", approvalId: "approval-smoke",
  evidenceId: "evidence-smoke", resultId: "result-smoke" } as const;
const smokeCase = { schemaVersion: 1, classification: "SYNTHETIC_NON_PRODUCTION", ...ids } as const;
async function fixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "company-os-customer-smoke-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); await mkdir(candidate, { mode: 0o700 });
  const cookie = join(root, "cookie"); const manifest = join(root, "smoke-case.json");
  await writeFile(cookie, "company_os.session=private-cookie\n", { mode: 0o600 });
  await writeFile(manifest, `${JSON.stringify(smokeCase)}\n`, { mode: 0o600 });
  return { candidate, cookie, manifest };
}
function responses(input: { readonly approved?: boolean } = {}) {
  return new Map<string, unknown>([
    ["/api/v1/access", { schemaVersion: 1, mode: "FORMAL", entryState: "READY",
      session: { authenticated: true }, capabilities: { companyData: true, companyMutation: true,
        execution: true, approval: true, governance: true } }],
    ["/api/v1/companies", { schemaVersion: 1, companies: [{ id: ids.companyId }] }],
    [`/api/v1/companies/${ids.companyId}/agent-boss`, { schemaVersion: 1, mode: "PRODUCTION",
      organization: { company: { id: ids.companyId } }, responsibilities: { contracts: [{
        id: ids.responsibilityContractId, agentId: ids.executingAgentId,
        accountableHumanId: ids.accountableHumanId }] }, work: [{ id: ids.workId,
        companyId: ids.companyId, agentId: ids.executingAgentId,
        accountableHumanId: ids.accountableHumanId,
        responsibilityContractId: ids.responsibilityContractId }], attempts: [{ id: ids.attemptId,
        workId: ids.workId, status: "SUCCEEDED", evidenceReferences: [ids.evidenceId],
        resultId: ids.resultId }] }],
    [`/api/v1/companies/${ids.companyId}/accountability-ledger`, { schemaVersion: 1,
      companyId: ids.companyId, approvals: [{ status: input.approved === false ? "REJECTED" : "APPROVED",
        request: { id: ids.approvalId, binding: { workId: ids.workId,
          executingAgentId: ids.executingAgentId, accountableHumanId: ids.accountableHumanId,
          responsibilityContractId: ids.responsibilityContractId } }, decision: {
          requestId: ids.approvalId, decision: input.approved === false ? "REJECTED" : "APPROVED" } }],
      evidence: [ids.evidenceId, ids.resultId].map((id) => ({ id, workId: ids.workId,
        attemptId: ids.attemptId, provenance: "PRODUCTION", contentDigest: `sha256:${"a".repeat(64)}` })) }],
  ]);
}

test("customer smoke proves one synthetic formal responsibility path without retaining session material", async (context) => {
  const value = await fixture(context); const paths: string[] = []; const payloads = responses();
  const operation = await createStagingUpgradeCustomerSmokeOperation({ candidateDirectory: value.candidate,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    candidateApiLoopbackOrigin: "http://127.0.0.1:4701", sessionCookieFile: value.cookie,
    smokeCaseFile: value.manifest }, { now: () => "2026-08-27T13:00:00.000Z",
    fetch: async (url, init) => { const parsed = new URL(String(url)); paths.push(parsed.pathname);
      assert.equal((init?.headers as Record<string, string>).cookie, "company_os.session=private-cookie");
      return new Response(JSON.stringify(payloads.get(parsed.pathname)), { status: 200 }); } });
  const result = await operation(); assert.equal(result.outcome,
    "IDENTITY_COMPANY_WORK_APPROVAL_EVIDENCE_PATH_PASSED");
  assert.deepEqual(paths, ["/api/v1/access", "/api/v1/companies",
    `/api/v1/companies/${ids.companyId}/agent-boss`,
    `/api/v1/companies/${ids.companyId}/accountability-ledger`]);
  const evidence = await readFile(join(value.candidate, "step-evidence", "customer-smoke.json"), "utf8");
  assert.doesNotMatch(evidence, /private-cookie|company_os\.session|work-smoke|human-smoke/);
  assert.equal(JSON.parse(evidence).classification, "SYNTHETIC_NON_PRODUCTION");
});

test("customer smoke rejects an incomplete approval chain and non-loopback origin", async (context) => {
  const value = await fixture(context); const payloads = responses({ approved: false });
  const operation = await createStagingUpgradeCustomerSmokeOperation({ candidateDirectory: value.candidate,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    candidateApiLoopbackOrigin: "http://127.0.0.1:4701", sessionCookieFile: value.cookie,
    smokeCaseFile: value.manifest }, { fetch: async (url) => new Response(
      JSON.stringify(payloads.get(new URL(String(url)).pathname)), { status: 200 }) });
  await assert.rejects(operation(), /STAGING_UPGRADE_SMOKE_ACCOUNTABILITY_PATH_INVALID/);
  await assert.rejects(createStagingUpgradeCustomerSmokeOperation({ candidateDirectory: value.candidate,
    operationId: "upgrade-rc4-to-rc5", siteId: "company-os-test-site",
    candidateReleaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
    candidateApiLoopbackOrigin: "https://candidate.example.com", sessionCookieFile: value.cookie,
    smokeCaseFile: value.manifest }), /STAGING_UPGRADE_SMOKE_ORIGIN_INVALID/);
});
