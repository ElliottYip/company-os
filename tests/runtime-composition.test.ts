import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createManagedCloudComposition, createSelfHostedComposition } from "../adapters/deployment/create-runtime-composition.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
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
  await composition.events.append({
    id: "event-one",
    companyId: "company-one",
    type: "runtime.smoke",
    occurredAt: "2026-08-18T08:00:00.000Z",
    actorId: "human-one",
    payload: {},
    provenance: "PRODUCTION",
  }, 0);
  assert.equal((await composition.events.read("company-one")).length, 1);
  assert.equal(composition.businessCodeProfile, "shared");
}

test("managed-cloud composition runs with injected cloud boundaries", async () => {
  const composition = createManagedCloudComposition({
    claimsProvider: claims,
    authorizationProvider: authorize,
    identityPolicy: policy,
    eventStore: new InMemoryEventStore(),
  });
  await smoke(composition);
  assert.equal(composition.profile, "managed-cloud");
  assert.equal(composition.identityKind, "raft-identity");
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
