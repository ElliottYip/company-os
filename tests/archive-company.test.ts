import assert from "node:assert/strict";
import test from "node:test";
import { ArchiveCompany } from "../application/archive-company.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { CompanyLifecycleStorePort } from "../ports/company-lifecycle-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const companyId = "company-one";
const digest = `sha256:${"a".repeat(64)}`;
const identity: IdentityPort = {
  async getCurrentIdentity() {
    return { actorId: "human-one", organizationId: companyId, displayName: "Alex",
      assurance: "ENTERPRISE_ASSERTED" };
  },
  async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Alex" }; },
  async authorize() {
    return { id: "receipt-one", principalId: "human-one", authorizedAt: "2026-08-25T03:00:00.000Z" };
  },
};

async function fixture() {
  const events = new InMemoryEventStore();
  await events.append({ id: "organization-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-25T02:00:00.000Z", actorId: "human-one", payload: {}, provenance: "PRODUCTION" });
  let archived: Parameters<CompanyLifecycleStorePort["archiveCompanyAtomically"]>[0] | null = null;
  const lifecycle: CompanyLifecycleStorePort = {
    async archiveCompanyAtomically(input) {
      archived = input;
      return { companyId, status: "archived", archivedAt: input.archivedAt,
        exportDigest: input.exportDigest, retentionPolicyId: input.retentionPolicyId };
    },
  };
  const service = new ArchiveCompany({ identity, events, lifecycle,
    portability: { async exportBackup() { return JSON.stringify({ digest }); } },
    now: () => "2026-08-25T03:00:00.000Z", nextId: () => "archive-one",
    retentionPolicyId: "standard-retention" });
  return { events, service, archived: () => archived };
}

test("company closure binds a fresh export digest and retention policy into the atomic archive", async () => {
  const { service, archived } = await fixture();
  const result = await service.execute({ companyId, expectedStatus: "active", exportDigest: digest,
    retentionPolicyId: "standard-retention", reason: "Customer-requested account closure" });
  assert.equal(result.status, "archived");
  assert.equal(archived()?.expectedEventSequence, 1);
  assert.deepEqual((archived()?.event.payload as Record<string, unknown>), {
    previousStatus: "active", status: "archived", exportDigest: digest,
    retentionPolicyId: "standard-retention", reason: "Customer-requested account closure",
    authorizationReceiptId: "receipt-one",
  });
});

test("company closure rejects a browser-supplied policy that differs from operator configuration", async () => {
  const { service } = await fixture();
  await assert.rejects(service.execute({ companyId, expectedStatus: "active", exportDigest: digest,
    retentionPolicyId: "short-retention", reason: "Close" }),
  /COMPANY_ARCHIVE_RETENTION_POLICY_MISMATCH/);
});

test("company closure fails closed for stale exports, unresolved work, and pending approval", async () => {
  const stale = await fixture();
  await assert.rejects(stale.service.execute({ companyId, expectedStatus: "active",
    exportDigest: `sha256:${"b".repeat(64)}`, retentionPolicyId: "standard-retention", reason: "Close" }),
  /COMPANY_ARCHIVE_EXPORT_STALE/);

  const working = await fixture();
  await working.events.append({ id: "attempt-one", companyId, type: "work-attempt.recorded",
    occurredAt: "2026-08-25T02:10:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { attempt: { id: "attempt-one", status: "OUTCOME_UNKNOWN" } } }, 1);
  await assert.rejects(working.service.execute({ companyId, expectedStatus: "active", exportDigest: digest,
    retentionPolicyId: "standard-retention", reason: "Close" }), /COMPANY_ARCHIVE_UNRESOLVED_WORK/);

  const approval = await fixture();
  await approval.events.append({ id: "approval-one", companyId, type: "approval.publication.requested",
    occurredAt: "2026-08-25T02:10:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { request: { id: "approval-one" } } }, 1);
  await assert.rejects(approval.service.execute({ companyId, expectedStatus: "active", exportDigest: digest,
    retentionPolicyId: "standard-retention", reason: "Close" }), /COMPANY_ARCHIVE_PENDING_APPROVAL/);
});
