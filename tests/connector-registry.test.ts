import assert from "node:assert/strict";
import test from "node:test";

import { ConnectorRegistry } from "../application/connector-registry.ts";
import { EventBackedConnectorCatalogStore } from "../adapters/storage/event-backed-connector-catalog-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { validateConnectorCatalog } from "../core/connector.ts";
import type { IdentityPort } from "../ports/identity-port.ts";

function connector() {
  return {
    id: "connector-one",
    companyId: "company-one",
    displayName: "Enterprise research connector",
    protocolVersion: "1.0" as const,
    operations: ["SUBMIT", "PROGRESS", "PAUSE", "RESUME", "CANCEL", "EVIDENCE", "RESULT"] as const,
    maximumTimeoutSeconds: 3_600,
    executionResidency: "CUSTOMER_ENVIRONMENT" as const,
    secretReferenceId: "secret-connector-one",
    status: "ENABLED" as const,
  };
}

function identity(assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance };
    },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human" }; },
    async authorize() {
      return { id: "receipt-connector", principalId: "human-one", authorizedAt: "2026-08-20T14:00:00.000Z" };
    },
  };
}

test("connector catalog is vendor-neutral and rejects incomplete lifecycle capabilities", () => {
  assert.deepEqual(validateConnectorCatalog([connector()])[0]?.operations, connector().operations);
  assert.throws(
    () => validateConnectorCatalog([{ ...connector(), operations: ["SUBMIT", "RESULT"] }]),
    /CONNECTOR_REQUIRED_OPERATION_MISSING/,
  );
  assert.throws(
    () => validateConnectorCatalog([{ ...connector(), operations: ["SUBMIT", "PROGRESS", "PAUSE", "RESULT"] }]),
    /CONNECTOR_PAUSE_RESUME_MISMATCH/,
  );
});

test("formal human can persist a revisioned connector catalog and Demo cannot", async () => {
  const events = new InMemoryEventStore();
  let eventId = 0;
  const store = new EventBackedConnectorCatalogStore(events, () => `connector-event-${++eventId}`);
  const registry = new ConnectorRegistry({ identity: identity(), store });
  const saved = await registry.replace({
    companyId: "company-one",
    expectedRevision: 0,
    connectors: [connector()],
    recordedAt: "2026-08-20T14:00:00.000Z",
  });
  assert.equal(saved.revision, 1);
  assert.equal(saved.connectors[0]?.executionResidency, "CUSTOMER_ENVIRONMENT");
  assert.deepEqual(await store.load("company-one"), saved);

  const demo = new ConnectorRegistry({ identity: identity("LOCAL_DEMO"), store });
  await assert.rejects(demo.replace({
    companyId: "company-one",
    expectedRevision: 1,
    connectors: [connector()],
    recordedAt: "2026-08-20T14:01:00.000Z",
  }), /FORMAL_IDENTITY_REQUIRED/);
});
