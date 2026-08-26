import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { Sha256ContentDigest } from "../adapters/security/sha256-content-digest.ts";
import { ExportAccountabilityPackage } from "../application/export-accountability-package.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";

const now = "2026-08-26T14:00:00.000Z";

function identity(organizationId = "company-one", assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED") {
  return {
    async getCurrentIdentity() { return { actorId: "human-one", organizationId, displayName: "Human One", assurance }; },
    async currentPrincipal() { return null; },
    async authorize(input: { action: string }) {
      assert.equal(input.action, "accountability:export");
      return { id: "authorization-export", principalId: "human-one", authorizedAt: now };
    },
  };
}

async function append(store: InMemoryEventStore, event: Omit<CompanyDomainEvent, "companyId" | "occurredAt" | "actorId" | "provenance">) {
  const current = await store.read("company-one");
  await store.append({ ...event, companyId: "company-one", occurredAt: now,
    actorId: "system", provenance: "PRODUCTION" }, current.length);
}

async function fixtureStore() {
  const store = new InMemoryEventStore();
  const responsibility = { workId: "work-one", goalInitiatorId: "human-one",
    accountableHumanId: "human-one", executingAgentId: "agent-one",
    permissionIds: ["permission-one"], dataAuthorizationIds: ["data-contract-one"] };
  await append(store, { id: "work-event", type: "work.dispatched", payload: {
    responsibility, privateSession: "must-not-export", rawEnterpriseRecord: "must-not-export",
  } });
  await append(store, { id: "attempt-event", type: "work-attempt.recorded", payload: {
    attempt: { id: "attempt-one", workId: "work-one" }, responsibility,
  } });
  await append(store, { id: "approval-event", type: "approval.publication.requested", payload: { request: {
    id: "approval-one", companyId: "company-one", status: "AWAITING_APPROVAL", requestedAt: now,
    expiresAt: "2026-08-26T15:00:00.000Z", binding: { action: { id: "publish", type: "PUBLISH",
      description: "Publish approved result", inputDigest: `sha256:${"a".repeat(64)}`, risk: "HIGH" },
    workId: "work-one", responsibilityContractId: "contract-one", executingAgentId: "agent-one",
    accountableHumanId: "human-one", evidenceReferences: ["evidence-one"], resultReference: null },
  }, responsibility } });
  await append(store, { id: "decision-event", type: "approval.publication.decided", payload: { decision: {
    requestId: "approval-one", decision: "APPROVED", decidedBy: "human-one", decidedAt: now,
  }, responsibility } });
  await append(store, { id: "observation-event", type: "connector.observation.recorded", payload: {
    attemptId: "attempt-one", responsibility, observation: { summary: "Result retained at execution edge",
      recordedAt: now, evidenceOutputs: [{ evidenceReference: "evidence-one",
        contentDigest: `sha256:${"b".repeat(64)}` }], resultReference: "evidence-one",
      vendorSession: "must-not-export", rawOutput: "must-not-export" },
  } });
  return store;
}

function service(store: InMemoryEventStore, identityPort = identity()) {
  let id = 0;
  return new ExportAccountabilityPackage({ identity: identityPort, events: store, now: () => now,
    nextId: () => `accountability-export-${++id}`, retentionPolicyId: "standard-retention",
    exportPolicyId: "standard-accountability-export", digests: new Sha256ContentDigest() });
}

test("accountability export binds policy, approval, evidence, responsibility and one audit receipt", async () => {
  const store = await fixtureStore();
  const result = await service(store).execute({ companyId: "company-one", requestId: "export-request-one",
    purposeCode: "AUDIT_REVIEW" });
  assert.equal(result.package.packageType, "COMPANY_OS_ACCOUNTABILITY_EXPORT");
  assert.deepEqual(result.package.policy, { retentionPolicyId: "standard-retention",
    exportPolicyId: "standard-accountability-export", purposeCode: "AUDIT_REVIEW" });
  assert.equal(result.package.approvals[0]?.status, "APPROVED");
  assert.equal(result.package.evidence[0]?.contentDigest, `sha256:${"b".repeat(64)}`);
  assert.deepEqual(result.package.responsibilities[0], { workId: "work-one", goalInitiatorId: "human-one",
    accountableHumanId: "human-one", executingAgentId: "agent-one", permissionReferences: ["permission-one"],
    dataAuthorizationReferences: ["data-contract-one"], approvalReferences: ["approval-one"],
    evidenceReferences: ["evidence-one"], resultReference: "evidence-one" });
  const { digest, ...unsigned } = result.package;
  assert.equal(digest, `sha256:${createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")}`);
  assert.doesNotMatch(JSON.stringify(result.package), /must-not-export|privateSession|rawEnterpriseRecord|vendorSession|rawOutput/);
  const audit = (await store.read("company-one")).filter(({ type }) => type === "accountability.export.completed");
  assert.equal(audit.length, 1);
  assert.doesNotMatch(JSON.stringify(audit), /Publish approved result|Result retained|permission-one|data-contract-one/);
});

test("accountability export is replay-safe and fails closed for Demo, tenant mismatch and missing responsibility", async () => {
  const store = await fixtureStore(); const exporter = service(store);
  const first = await exporter.execute({ companyId: "company-one", requestId: "export-request-one",
    purposeCode: "INCIDENT_REVIEW" });
  const replay = await exporter.execute({ companyId: "company-one", requestId: "export-request-one",
    purposeCode: "INCIDENT_REVIEW" });
  assert.deepEqual(replay, first);
  assert.equal((await store.read("company-one")).filter(({ type }) => type === "accountability.export.completed").length, 1);
  await assert.rejects(service(store, identity("company-one", "LOCAL_DEMO")).execute({ companyId: "company-one",
    requestId: "export-request-two", purposeCode: "AUDIT_REVIEW" }), /FORMAL_IDENTITY_REQUIRED/);
  await assert.rejects(service(store, identity("company-two")).execute({ companyId: "company-one",
    requestId: "export-request-two", purposeCode: "AUDIT_REVIEW" }), /TENANT_MISMATCH/);
  const corrupt = new InMemoryEventStore();
  await append(corrupt, { id: "evidence-event", type: "evidence.persisted", payload: { record: {
    id: "evidence-one", workId: "work-one", kind: "RESULT", summary: "Digest only",
    contentDigest: `sha256:${"c".repeat(64)}`, recordedAt: now, provenance: "PRODUCTION" } } });
  await assert.rejects(service(corrupt).execute({ companyId: "company-one", requestId: "export-request-three",
    purposeCode: "AUDIT_REVIEW" }), /ACCOUNTABILITY_EXPORT_RESPONSIBILITY_MISSING/);
});

test("accountability export projects the canonical formal Work and Attempt responsibility records", async () => {
  const store = new InMemoryEventStore();
  const work = { id: "work-formal", companyId: "company-one", title: "Formal report", goal: "Publish safely",
    scope: "AGENT", departmentId: "department-one", projectId: null, agentId: "agent-one",
    requestedBy: "human-one", actionIds: ["publish-content"], parentWorkId: null,
    accountableHumanId: "human-one", responsibilityContractId: "contract-one",
    runtimeConnectorId: "connector-one", status: "ASSIGNED" };
  await append(store, { id: "work-formal-event", type: "work.dispatched", payload: { work } });
  await append(store, { id: "attempt-formal-event", type: "work-attempt.recorded", payload: { operation: "CREATE",
    attempt: { id: "attempt-formal", companyId: "company-one", workId: "work-formal", agentId: "agent-one",
      authority: { permissionIds: ["authorization-formal"], dataAuthorizationIds: ["data-formal"] } } } });
  await append(store, { id: "approval-formal-event", type: "approval.publication.requested", payload: { request: {
    id: "approval-formal", companyId: "company-one", status: "AWAITING_APPROVAL", requestedAt: now,
    expiresAt: "2026-08-26T15:00:00.000Z", binding: { action: { id: "publish-content", type: "PUBLISH",
      description: "Publish", inputDigest: `sha256:${"d".repeat(64)}`, risk: "HIGH" },
    workId: "work-formal", responsibilityContractId: "contract-one", executingAgentId: "agent-one",
    accountableHumanId: "human-one", evidenceReferences: ["evidence-formal"], resultReference: null } } } });
  await append(store, { id: "evidence-formal-event", type: "evidence.persisted", payload: { record: {
    id: "evidence-formal", workId: "work-formal", kind: "RESULT", summary: "Formal result",
    contentDigest: `sha256:${"e".repeat(64)}`, recordedAt: now, provenance: "PRODUCTION" } } });

  const result = await service(store).execute({ companyId: "company-one", requestId: "formal-export-request",
    purposeCode: "AUDIT_REVIEW" });
  assert.deepEqual(result.package.responsibilities, [{ workId: "work-formal", goalInitiatorId: "human-one",
    accountableHumanId: "human-one", executingAgentId: "agent-one",
    permissionReferences: ["authorization-formal"], dataAuthorizationReferences: ["data-formal"],
    approvalReferences: ["approval-formal"], evidenceReferences: ["evidence-formal"],
    resultReference: "evidence-formal" }]);
});
