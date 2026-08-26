import assert from "node:assert/strict";
import test from "node:test";
import { EventBackedOrganizationPrincipalStore } from "../adapters/storage/event-backed-organization-principal-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";

test("formal organization and principals project from the append-only registration event", async () => {
  const events = new InMemoryEventStore();
  await events.append({
    id: "event-one", companyId: "company-one", type: "organization.registered",
    occurredAt: "2026-08-24T10:00:00.000Z", actorId: "human-one", provenance: "PRODUCTION",
    payload: { structure: {
      organization: {
        company: { id: "company-one", name: "Coral Labs", purpose: "Accountable work", locale: "en-US" },
        departments: [{ id: "department-one", name: "Operations", mandate: "Operate" }],
        humans: [{ id: "human-one", name: "Human One", title: "Owner", departmentId: "department-one", avatarId: "human-default" }],
        agents: [{ id: "agent-one", name: "Agent One", role: "Research", departmentId: "department-one", accountableHumanId: "human-one", runtimeConnectorId: "connector-unbound", avatarId: "fish-bumble", autonomyLevel: 1 }],
      },
      projects: [], workspaces: [],
      positions: [
        { id: "position-human", title: "Owner", departmentId: "department-one", principalId: "human-one", accountableHumanId: "human-one" },
        { id: "position-agent", title: "Research", departmentId: "department-one", principalId: "agent-one", accountableHumanId: "human-one" },
      ],
      reportingLines: [{ subordinatePositionId: "position-agent", managerPositionId: "position-human" }],
    } },
  });
  const projection = new EventBackedOrganizationPrincipalStore(events);
  assert.equal((await projection.getOrganization("company-one"))?.company.name, "Coral Labs");
  assert.deepEqual(await projection.listPrincipals("company-one"), [
    { id: "human-one", kind: "HUMAN", displayName: "Human One" },
    { id: "agent-one", kind: "SERVICE", displayName: "Agent One" },
  ]);
});
