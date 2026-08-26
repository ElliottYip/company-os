import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { ManageSecretReference } from "../application/manage-secret-reference.ts";
import type { SecretReference, SecretReferenceManagementResult } from "../core/secret-governance.ts";

const activeReference: SecretReference = {
  id: "model-key", companyId: "company-one", purpose: "MODEL_PROVIDER",
  providerAdapterId: "model-provider", currentVersion: 4, status: "ACTIVE",
};

function harness(options: {
  reference?: SecretReference | null;
  result?: SecretReferenceManagementResult;
  assurance?: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO";
  organizationId?: string;
  managementUrl?: string;
} = {}) {
  const events = new InMemoryEventStore();
  let resultCalls = 0;
  let eventIds = 0;
  const broker = {
    async describe() { return options.reference === undefined ? null : options.reference; },
    async issueLease() { throw new Error("NOT_USED"); },
    async revokeLease() {},
    async beginReferenceManagement(intent: { companyId: string; referenceId: string; operation: string }) {
      return { id: "management-session", companyId: intent.companyId, referenceId: intent.referenceId,
        operation: intent.operation as "CREATE", managementUrl: options.managementUrl ?? "https://broker.example/manage/opaque-session",
        expiresAt: "2026-08-25T12:10:00.000Z" };
    },
    async referenceManagementResult() { resultCalls += 1; return options.result ?? { status: "PENDING" as const }; },
  };
  const service = new ManageSecretReference({
    broker, events, now: () => "2026-08-25T12:00:00.000Z", nextId: () => `event-${++eventIds}`,
    identity: {
      async getCurrentIdentity() { return { actorId: "human-one", organizationId: options.organizationId ?? "company-one",
        displayName: "Human One", assurance: options.assurance ?? "ENTERPRISE_ASSERTED" }; },
      async currentPrincipal() { return null; },
      async authorize() { return { id: "authorization-one", principalId: "human-one",
        authorizedAt: "2026-08-25T12:00:00.000Z" }; },
    },
  });
  return { service, events, resultCalls: () => resultCalls };
}

test("secret reference creation hands the browser to the broker without persisting its URL", async () => {
  const { service, events } = harness();
  const session = await service.begin({ companyId: "company-one", referenceId: "model-key", operation: "CREATE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: null });
  assert.equal(session.managementUrl, "https://broker.example/manage/opaque-session");
  const serialized = JSON.stringify(await events.read("company-one"));
  assert.doesNotMatch(serialized, /managementUrl|broker\.example|secretValue|credentialValue|accessToken/i);
  assert.match(serialized, /secret\.reference-management-started/);
});

test("secret reference confirmation is pending-safe and completion-idempotent", async () => {
  const completed: SecretReferenceManagementResult = { status: "COMPLETED", reference: {
    ...activeReference, currentVersion: 1,
  } };
  const setup = harness({ result: completed });
  await setup.service.begin({ companyId: "company-one", referenceId: "model-key", operation: "CREATE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: null });
  assert.deepEqual(await setup.service.confirm("company-one", "management-session"), completed);
  assert.deepEqual(await setup.service.confirm("company-one", "management-session"), completed);
  assert.equal(setup.resultCalls(), 1);
  assert.equal((await setup.events.read("company-one")).filter(({ type }) =>
    type === "secret.reference-management-completed").length, 1);
});

test("secret rotation enforces exact version and result transition", async () => {
  const setup = harness({ reference: activeReference, result: { status: "COMPLETED", reference: {
    ...activeReference, currentVersion: 5,
  } } });
  await setup.service.begin({ companyId: "company-one", referenceId: "model-key", operation: "ROTATE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: 4 });
  const result = await setup.service.confirm("company-one", "management-session");
  assert.equal(result.status, "COMPLETED");

  const mismatch = harness({ reference: activeReference });
  await assert.rejects(mismatch.service.begin({ companyId: "company-one", referenceId: "model-key",
    operation: "ROTATE", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: 3 }),
  /SECRET_VERSION_MISMATCH/);
});

test("secret reference management rejects demo and cross-tenant identities", async () => {
  const intent = { companyId: "company-one", referenceId: "model-key", operation: "CREATE" as const,
    purpose: "MODEL_PROVIDER" as const, providerAdapterId: "model-provider", expectedVersion: null };
  await assert.rejects(harness({ assurance: "LOCAL_DEMO" }).service.begin(intent), /FORMAL_IDENTITY_REQUIRED/);
  await assert.rejects(harness({ organizationId: "company-two" }).service.begin(intent), /TENANT_MISMATCH/);
});

test("secret reference management validates suspension, revocation, handoff URL and completion binding", async () => {
  for (const [operation, status] of [["SUSPEND", "SUSPENDED"], ["REVOKE", "REVOKED"]] as const) {
    const setup = harness({ reference: activeReference, result: { status: "COMPLETED", reference: {
      ...activeReference, status,
    } } });
    await setup.service.begin({ companyId: "company-one", referenceId: "model-key", operation,
      purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: 4 });
    assert.equal((await setup.service.confirm("company-one", "management-session")).status, "COMPLETED");
  }
  await assert.rejects(harness({ managementUrl: "http://broker.example/manage" }).service.begin({
    companyId: "company-one", referenceId: "model-key", operation: "CREATE", purpose: "MODEL_PROVIDER",
    providerAdapterId: "model-provider", expectedVersion: null,
  }), /SECRET_MANAGEMENT_URL_INVALID/);
  const invalid = harness({ result: { status: "COMPLETED", reference: {
    ...activeReference, currentVersion: 2,
  } } });
  await invalid.service.begin({ companyId: "company-one", referenceId: "model-key", operation: "CREATE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider", expectedVersion: null });
  await assert.rejects(invalid.service.confirm("company-one", "management-session"),
    /SECRET_MANAGEMENT_RESULT_INVALID/);
});
