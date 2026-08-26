import assert from "node:assert/strict";
import test from "node:test";
import { CompanyRegistry } from "../application/company-registry.ts";
import { SetupInitialOrganization } from "../application/setup-initial-organization.ts";
import { SessionCompanyIdentityAdapter } from "../adapters/identity/session-company-identity-adapter.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";

test("formal first company setup creates one real accountable human and no fixture Agent", async () => {
  const events = new InMemoryEventStore();
  let sequence = 0;
  const nextId = () => `id-${++sequence}`;
  const identity = new SessionCompanyIdentityAdapter({
    user: { id: "human-one", displayName: "Human One" }, companyId: "company-one",
    memberships: [{ companyId: "company-one", principalType: "user", principalId: "human-one", status: "active", role: "owner" }],
    now: () => "2026-08-24T10:00:00.000Z", nextId,
  });
  const registry = new CompanyRegistry({
    identity, events, now: () => "2026-08-24T10:00:00.000Z", nextId,
  });
  const service = new SetupInitialOrganization({ registry, nextId });
  const structure = await service.execute({
    company: { id: "company-one", name: "Coral Labs", purpose: "Accountable work", locale: "en-US" },
    owner: { id: "human-one", name: "Human One", title: "Founder" },
    departmentName: "Operations",
  });
  assert.equal(structure.organization.humans[0]?.id, "human-one");
  assert.equal(structure.organization.agents.length, 0);
  assert.equal((await registry.get("company-one"))?.organization.company.name, "Coral Labs");
  assert.equal((await events.read("company-one", { types: ["organization.registered"] })).length, 1);
});
