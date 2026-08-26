import assert from "node:assert/strict";
import test from "node:test";
import { AcceptHumanInvite, CreateHumanInvite } from "../application/human-invites.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { HumanInvite } from "../core/human-invite.ts";
import type { HumanInviteStorePort } from "../ports/human-invite-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

const companyId = "company-one";
const events = () => new InMemoryEventStore();

function identity(): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "owner-one", organizationId: companyId, displayName: "Owner", assurance: "ENTERPRISE_ASSERTED" };
    },
    async currentPrincipal() { return { id: "owner-one", kind: "HUMAN", displayName: "Owner" }; },
    async authorize() {
      return { id: "receipt-one", principalId: "owner-one", authorizedAt: "2026-08-24T00:00:00.000Z" };
    },
  };
}

class MemoryInviteStore implements HumanInviteStorePort {
  invite: HumanInvite | null = null;
  tokenHash: string | null = null;
  accepted: Parameters<HumanInviteStorePort["acceptAtomically"]>[0] | null = null;
  async create(input: { invite: HumanInvite; tokenHash: string }) {
    this.invite = structuredClone(input.invite); this.tokenHash = input.tokenHash;
    return structuredClone(input.invite);
  }
  async findPendingByTokenHash(tokenHash: string) {
    return tokenHash === this.tokenHash ? structuredClone(this.invite) : null;
  }
  async acceptAtomically(input: Parameters<HumanInviteStorePort["acceptAtomically"]>[0]) {
    this.accepted = structuredClone(input);
    this.invite = { ...this.invite!, acceptedAt: input.acceptedAt };
    return structuredClone(this.invite);
  }
}

async function registeredEvents() {
  const store = events();
  await store.append({
    id: "event-one", companyId, type: "organization.registered",
    occurredAt: "2026-08-24T00:00:00.000Z", actorId: "owner-one", provenance: "PRODUCTION",
    payload: { structure: {
      organization: {
        company: { id: companyId, name: "Acme", purpose: "Operate", locale: "en" },
        departments: [{ id: "operations", name: "Operations", mandate: "Operate" }],
        humans: [{ id: "owner-one", name: "Owner", title: "Founder", departmentId: "operations", avatarId: "human-default" }],
        agents: [],
      },
      projects: [], workspaces: [{ id: "workspace-one", name: "Operations", projectId: null, departmentId: "operations" }],
      positions: [{ id: "position-one", title: "Founder", departmentId: "operations", principalId: "owner-one", accountableHumanId: "owner-one" }],
      reportingLines: [],
    } },
  });
  return store;
}

test("human invite stores only a token hash and binds role, department, email, and expiry", async () => {
  const store = new MemoryInviteStore();
  const eventStore = await registeredEvents();
  const service = new CreateHumanInvite({
    identity: identity(), events: eventStore, store,
    now: () => "2026-08-24T00:00:00.000Z", nextId: () => "invite-one",
    issueToken: () => "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz",
    hashToken: (token) => `hash:${token}`,
  });
  const result = await service.execute({
    companyId, email: " Jordan@Example.com ", departmentId: "operations",
    title: "Operations Lead", role: "operator",
  });
  assert.match(result.token, /^company_os_invite_/);
  assert.equal(store.tokenHash, `hash:${result.token}`);
  assert.equal(store.invite?.expectedEmail, "jordan@example.com");
  assert.equal(store.invite?.membershipRole, "operator");
  assert.equal(store.invite?.expiresAt, "2026-08-31T00:00:00.000Z");
});

test("authenticated OIDC user acceptance atomically creates membership, grants, and organization event", async () => {
  const store = new MemoryInviteStore();
  const eventStore = await registeredEvents();
  const token = "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz";
  await new CreateHumanInvite({
    identity: identity(), events: eventStore, store,
    now: () => "2026-08-24T00:00:00.000Z", nextId: () => "invite-one",
    issueToken: () => token, hashToken: (value) => `hash:${value}`,
  }).execute({ companyId, email: "jordan@example.com", departmentId: "operations", title: "Lead", role: "operator" });
  let id = 0;
  await new AcceptHumanInvite({
    events: eventStore, store, now: () => "2026-08-24T01:00:00.000Z",
    nextId: () => `generated-${++id}`, hashToken: (value) => `hash:${value}`,
  }).execute({ token, user: { id: "human-jordan", name: "Jordan", email: "JORDAN@example.com" } });
  assert.equal(store.accepted?.userId, "human-jordan");
  assert.deepEqual(store.accepted?.grants.map(({ permissionKey }) => permissionKey), ["tasks:assign"]);
  const structure = (store.accepted?.event.payload as { structure: { organization: { humans: { id: string }[] } } }).structure;
  assert.ok(structure.organization.humans.some(({ id }) => id === "human-jordan"));
  assert.equal(store.accepted?.event.type, "organization.revised");
});

test("invite acceptance fails closed for an OIDC email mismatch", async () => {
  const store = new MemoryInviteStore();
  const eventStore = await registeredEvents();
  const token = "company_os_invite_0123456789abcdefghijklmnopqrstuvwxyz";
  await new CreateHumanInvite({
    identity: identity(), events: eventStore, store,
    now: () => "2026-08-24T00:00:00.000Z", nextId: () => "invite-one",
    issueToken: () => token, hashToken: (value) => `hash:${value}`,
  }).execute({ companyId, email: "jordan@example.com", departmentId: "operations", title: "Lead", role: "viewer" });
  await assert.rejects(new AcceptHumanInvite({
    events: eventStore, store, now: () => "2026-08-24T01:00:00.000Z",
    nextId: () => "generated", hashToken: (value) => `hash:${value}`,
  }).execute({ token, user: { id: "attacker", name: "Other", email: "other@example.com" } }), /HUMAN_INVITE_IDENTITY_MISMATCH/);
  assert.equal(store.accepted, null);
});
