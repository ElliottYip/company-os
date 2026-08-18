import assert from "node:assert/strict";
import test from "node:test";

import { CompanyOperations } from "../application/company-operations.ts";
import { EventBackedApprovalStore } from "../adapters/storage/event-backed-approval-store.ts";
import { EventBackedAuditEvidenceStore } from "../adapters/storage/event-backed-audit-evidence-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";

test("formal work resumes through the shared application service after restart", async () => {
  const events = new InMemoryEventStore();
  let sequence = 0;
  const create = () => new CompanyOperations({
    mode: "PRODUCTION",
    companyId: "company-one",
    actorId: "human-one",
    eventStore: events,
    approval: new EventBackedApprovalStore(events, "company-one", () => `store-event-${++sequence}`, () => "2026-08-18T08:00:00.000Z"),
    auditEvidence: new EventBackedAuditEvidenceStore(events, "company-one", () => `store-event-${++sequence}`),
    organization: {
      async getOrganization() {
        return {
          company: { id: "company-one", name: "Company One", purpose: "", locale: "en" },
          departments: [{ id: "operations", name: "Operations", mandate: "" }],
          humans: [{ id: "human-one", name: "Human", title: "Boss", departmentId: "operations", avatarId: "human-one" }],
          agents: [{ id: "agent-one", name: "Agent", role: "Research", departmentId: "operations", accountableHumanId: "human-one", runtimeConnectorId: "connector-one", avatarId: "fish-bumble", autonomyLevel: 2 }],
        };
      },
      async listPrincipals() { return [{ id: "human-one", kind: "HUMAN" as const, displayName: "Human" }]; },
    },
    sources: {
      nextId: () => `work-event-${++sequence}`,
      now: () => "2026-08-18T08:00:00.000Z",
      reset: () => undefined,
    },
    identity: {
      async getCurrentIdentity() {
        return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance: "ENTERPRISE_ASSERTED" as const };
      },
      async currentPrincipal() { return { id: "human-one", kind: "HUMAN" as const, displayName: "Human" }; },
      async authorize() {
        return { id: `authorization-${++sequence}`, principalId: "human-one", authorizedAt: "2026-08-18T08:00:00.000Z" };
      },
    },
    work: {
      workId: "work-one",
      goalInitiatorId: "human-one",
      accountableHumanId: "human-one",
      executingAgentId: "agent-one",
      responsibilityContractId: "responsibility-one",
      permissionIds: ["permission-read", "permission-publish"],
      dataAuthorizationIds: ["data-contract-one"],
      approvalId: "approval-one",
      approvalAction: { id: "action-one", type: "publish-content", description: "Publish brief", inputDigest: "sha256:formal-action", risk: "HIGH" },
      approvalExpiresAt: "2026-08-18T09:00:00.000Z",
      planEvidenceId: "evidence-plan",
      activityEvidenceId: "evidence-activity",
      resultEvidenceId: "evidence-result",
      resultId: "result-one",
      summaries: {
        assigned: "Assign research brief", plan: "Record plan", activity: "Read authorized data",
        approvalRequested: "Await approval", approvalApproved: "Approved", approvalRejected: "Rejected",
        resultEvidence: "Record result evidence", completed: "Work completed",
      },
    },
  });

  const first = create();
  await first.assignWork();
  await first.recordPlan();
  await first.recordToolActivity();
  await first.requestApproval();
  assert.equal((await first.snapshot()).phase, "AWAITING_APPROVAL");

  const restarted = create();
  const completed = await restarted.decideApproval("APPROVED");
  assert.equal(completed.phase, "COMPLETED");
  assert.equal(completed.responsibility.resultId, "result-one");
  assert.equal(JSON.stringify(completed).includes("demo-"), false);
  assert.equal((await new EventBackedAuditEvidenceStore(events, "company-one", () => "unused").projectResponsibility("work-one")).evidenceReferences.length, 3);
});
