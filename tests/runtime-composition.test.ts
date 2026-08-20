import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createManagedCloudComposition, createSelfHostedComposition } from "../adapters/deployment/create-runtime-composition.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import type { RuntimeComposition } from "../adapters/deployment/create-runtime-composition.ts";

const policy = {
  issuer: "https://identity.fixture.example",
  audience: "company-os",
  now: () => "2026-08-18T08:00:00.000Z",
};
const claims = async () => ({
  subject: "human-one",
  organization: "company-one",
  displayName: "Human One",
  issuer: policy.issuer,
  audience: policy.audience,
  expiresAt: "2026-08-18T09:00:00.000Z",
});
const authorize = async () => ({
  id: "receipt-one",
  principalId: "human-one",
  authorizedAt: "2026-08-18T08:00:00.000Z",
});

async function smoke(composition: RuntimeComposition): Promise<void> {
  assert.equal((await composition.identity.getCurrentIdentity())?.organizationId, "company-one");
  await composition.controlPlaneStore.commit({
    expectedEventSequence: 0,
    publications: [{
      id: "publication-one", companyId: "company-one", topic: "connector.commands",
      partitionKey: "attempt-one", payload: { attemptId: "attempt-one" },
      occurredAt: "2026-08-18T08:00:00.000Z",
    }],
    event: {
    id: "event-one",
    companyId: "company-one",
    type: "runtime.smoke",
    occurredAt: "2026-08-18T08:00:00.000Z",
    actorId: "human-one",
    payload: {},
    provenance: "PRODUCTION",
    },
  });
  assert.equal((await composition.events.read("company-one")).length, 1);
  assert.equal((await composition.controlPlaneStore.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 1);
  assert.match(await composition.controlPlaneStore.exportBackup("company-one"), /sha256:/);
  assert.equal(composition.businessCodeProfile, "shared");
}

test("managed-cloud composition runs with injected cloud boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-managed-cloud-"));
  const composition = createManagedCloudComposition({
    claimsProvider: claims,
    authorizationProvider: authorize,
    identityPolicy: policy,
    controlPlaneStore: new LocalDurableControlPlaneStore(directory),
  });
  await smoke(composition);
  assert.equal(composition.profile, "managed-cloud");
  assert.equal(composition.identityKind, "raft-identity");
});

test("managed-cloud admission rejects a non-durable event-only store", () => {
  assert.throws(() => createManagedCloudComposition({
    claimsProvider: claims,
    authorizationProvider: authorize,
    identityPolicy: policy,
    controlPlaneStore: new InMemoryEventStore() as never,
  }), /durable control-plane store/i);
});

test("self-hosted composition runs the same contract with enterprise identity and local storage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-self-hosted-"));
  const composition = createSelfHostedComposition({
    claimsProvider: claims,
    authorizationProvider: authorize,
    identityPolicy: policy,
    dataDirectory: directory,
  });
  await smoke(composition);
  assert.equal(composition.profile, "self-hosted");
  assert.equal(composition.identityKind, "enterprise-oidc");
});

test("both profiles restore their versioned durable backup into an empty rollback target", async () => {
  for (const profile of ["managed-cloud", "self-hosted"] as const) {
    const sourceDirectory = await mkdtemp(join(tmpdir(), `company-os-${profile}-source-`));
    const targetDirectory = await mkdtemp(join(tmpdir(), `company-os-${profile}-target-`));
    const source = profile === "managed-cloud"
      ? createManagedCloudComposition({ claimsProvider: claims, authorizationProvider: authorize, identityPolicy: policy, controlPlaneStore: new LocalDurableControlPlaneStore(sourceDirectory) })
      : createSelfHostedComposition({ claimsProvider: claims, authorizationProvider: authorize, identityPolicy: policy, dataDirectory: sourceDirectory });
    await smoke(source);
    const backup = await source.controlPlaneStore.exportBackup("company-one");
    const target = profile === "managed-cloud"
      ? createManagedCloudComposition({ claimsProvider: claims, authorizationProvider: authorize, identityPolicy: policy, controlPlaneStore: new LocalDurableControlPlaneStore(targetDirectory) })
      : createSelfHostedComposition({ claimsProvider: claims, authorizationProvider: authorize, identityPolicy: policy, dataDirectory: targetDirectory });
    await target.controlPlaneStore.restoreBackup("company-one", backup);
    assert.equal((await target.events.read("company-one")).length, 1, profile);
    assert.equal((await target.controlPlaneStore.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 1, profile);
  }
});
