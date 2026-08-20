import assert from "node:assert/strict";
import test from "node:test";

import { IssueSecretLease } from "../application/issue-secret-lease.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import type { SecretBrokerPort } from "../ports/secret-broker-port.ts";

function identity(assurance: "ENTERPRISE_ASSERTED" | "LOCAL_DEMO" = "ENTERPRISE_ASSERTED"): IdentityPort {
  return {
    async getCurrentIdentity() {
      return { actorId: "human-one", organizationId: "company-one", displayName: "Human", assurance };
    },
    async currentPrincipal() { return { id: "human-one", kind: "HUMAN", displayName: "Human" }; },
    async authorize() {
      return { id: "receipt-secret-one", principalId: "human-one", authorizedAt: "2026-08-20T13:00:00.000Z" };
    },
  };
}

function request() {
  return {
    companyId: "company-one",
    secretReferenceId: "secret-model-one",
    expectedVersion: 4,
    consumerId: "connector-one",
    workAttemptId: "attempt-one",
    reasonCode: "MODEL_INFERENCE",
    expiresAt: "2026-08-20T13:05:00.000Z",
  };
}

test("secret access intent is audited before a secret-free lease is issued", async () => {
  const events = new InMemoryEventStore();
  const order: string[] = [];
  const broker: SecretBrokerPort = {
    async describe() {
      return {
        id: "secret-model-one",
        companyId: "company-one",
        purpose: "MODEL_PROVIDER",
        providerAdapterId: "model-provider-one",
        currentVersion: 4,
        status: "ACTIVE",
      };
    },
    async issueLease(input) {
      order.push("broker");
      assert.equal((await events.read("company-one")).at(-1)?.type, "secret.access-authorized");
      return { ok: true, value: {
        id: "lease-one",
        secretReferenceId: input.secretReferenceId,
        version: input.expectedVersion,
        consumerId: input.consumerId,
        workAttemptId: input.workAttemptId,
        issuedAt: "2026-08-20T13:00:01.000Z",
        expiresAt: input.expiresAt,
        attestationDigest: `sha256:${"b".repeat(64)}`,
      } };
    },
    async revokeLease() { throw new Error("not used"); },
  };
  let id = 0;
  const service = new IssueSecretLease({
    identity: identity(), broker, events,
    now: () => "2026-08-20T13:00:00.000Z",
    nextId: () => `secret-event-${++id}`,
  });

  const lease = await service.execute(request());
  order.push("returned");
  assert.deepEqual(order, ["broker", "returned"]);
  assert.equal(lease.secretReferenceId, "secret-model-one");
  assert.doesNotMatch(JSON.stringify(lease), /credential|password|private.?key|access.?token|secretValue/i);
  assert.deepEqual((await events.read("company-one")).map(({ type }) => type), [
    "secret.access-authorized",
    "secret.lease-issued",
  ]);
});

test("Demo identity cannot issue a formal secret lease", async () => {
  let called = false;
  const service = new IssueSecretLease({
    identity: identity("LOCAL_DEMO"),
    broker: {
      async describe() { called = true; throw new Error("must not run"); },
      async issueLease() { called = true; throw new Error("must not run"); },
      async revokeLease() { called = true; throw new Error("must not run"); },
    },
    events: new InMemoryEventStore(),
    now: () => "2026-08-20T13:00:00.000Z",
    nextId: () => "unused",
  });
  await assert.rejects(service.execute(request()), /FORMAL_IDENTITY_REQUIRED/);
  assert.equal(called, false);
});

test("broker failures persist only a stable failure code", async () => {
  const events = new InMemoryEventStore();
  const service = new IssueSecretLease({
    identity: identity(),
    broker: {
      async describe() {
        return {
          id: "secret-model-one", companyId: "company-one", purpose: "MODEL_PROVIDER",
          providerAdapterId: "model-provider-one", currentVersion: 4, status: "ACTIVE",
        };
      },
      async issueLease() {
        return { ok: false, error: { code: "SECRET_BROKER_UNAVAILABLE", retryable: true } };
      },
      async revokeLease() { throw new Error("not used"); },
    },
    events,
    now: () => "2026-08-20T13:00:00.000Z",
    nextId: (() => { let id = 0; return () => `secret-failed-event-${++id}`; })(),
  });
  await assert.rejects(service.execute(request()), /SECRET_LEASE_FAILED:SECRET_BROKER_UNAVAILABLE/);
  const stored = JSON.stringify(await events.read("company-one"));
  assert.match(stored, /SECRET_BROKER_UNAVAILABLE/);
  assert.doesNotMatch(stored, /vault stack|raw provider response/i);
});
