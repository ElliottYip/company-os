import assert from "node:assert/strict";
import test from "node:test";
import { ManageCompanyMembers } from "../application/manage-company-members.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { CompanyAccessStorePort } from "../ports/company-access-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const companyId = "company-one";

function identity(): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "owner-one", organizationId: companyId, displayName: "Owner", assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: "owner-one", kind: "HUMAN", displayName: "Owner" }; },
    async authorize() { return { id: "receipt-one", principalId: "owner-one", authorizedAt: "2026-08-25T00:00:00.000Z" }; },
  };
}

function accessStore() {
  let update: Parameters<CompanyAccessStorePort["updateCompanyHumanMembership"]>[0] | null = null;
  const store: CompanyAccessStorePort = {
    async listCompanyIds() { return [companyId]; },
    async claimFirstInstanceAdmin() { return { status: "CLAIMED", userId: "owner-one" }; },
    async createOwnedCompany() { throw new Error("NOT_USED"); },
    async listActiveHumanMemberships() { return []; },
    async listCompanyHumanMembers() { return []; },
    async updateCompanyHumanMembership(input) {
      update = structuredClone(input);
      return {
        userId: input.userId, displayName: "Jordan", email: "jordan@example.com",
        role: input.role, status: input.status,
        createdAt: "2026-08-24T00:00:00.000Z", updatedAt: input.changedAt,
      };
    },
    async isInstanceAdmin() { return false; },
    async listPermissionKeys() { return []; },
  };
  return { store, update: () => update };
}

async function organizationEvents(accountableHumanId?: string) {
  const events = new InMemoryEventStore();
  await events.append({
    id: "event-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-24T00:00:00.000Z", actorId: "owner-one", provenance: "PRODUCTION",
    payload: { structure: {
      organization: {
        company: { id: companyId, name: "Acme", purpose: "Operate", locale: "en" },
        departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
        humans: [
          { id: "owner-one", name: "Owner", title: "Founder", departmentId: "operations", avatarId: "human-default" },
          { id: "human-jordan", name: "Jordan", title: "Lead", departmentId: "operations", avatarId: "human-default" },
        ],
        agents: accountableHumanId ? [{
          id: "agent-one", name: "Research", role: "Research", departmentId: "operations",
          accountableHumanId, runtimeConnectorId: "connector-one", autonomyLevel: 2,
        }] : [],
      },
      projects: [], workspaces: [], positions: [], reportingLines: [],
    } },
  });
  return events;
}

test("member role change replaces grants and records a stable audit event", async () => {
  const access = accessStore();
  let id = 0;
  const member = await new ManageCompanyMembers({
    identity: identity(), events: await organizationEvents(), store: access.store,
    now: () => "2026-08-25T00:00:00.000Z", nextId: () => `generated-${++id}`,
  }).update({
    companyId, userId: "human-jordan", expectedRole: "operator", expectedStatus: "active",
    role: "admin", status: "active",
  });
  assert.equal(member.role, "admin");
  assert.ok(access.update()?.permissionGrants.some(({ permissionKey }) => permissionKey === "users:invite"));
  assert.ok(!access.update()?.permissionGrants.some(({ permissionKey }) => permissionKey === "users:manage_permissions"));
  assert.equal(access.update()?.event.type, "access.human-membership.changed");
  assert.equal(access.update()?.expectedEventSequence, 1);
});

test("an accountable human cannot be suspended before explicit responsibility transfer", async () => {
  const access = accessStore();
  await assert.rejects(new ManageCompanyMembers({
    identity: identity(), events: await organizationEvents("human-jordan"), store: access.store,
    now: () => "2026-08-25T00:00:00.000Z", nextId: () => "generated",
  }).update({
    companyId, userId: "human-jordan", expectedRole: "operator", expectedStatus: "active",
    role: "operator", status: "suspended",
  }), /ACCOUNTABLE_HUMAN_TRANSFER_REQUIRED/);
  assert.equal(access.update(), null);
});
