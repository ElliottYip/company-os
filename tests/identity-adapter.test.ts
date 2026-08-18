import assert from "node:assert/strict";
import test from "node:test";

import { RaftIdentityAdapter } from "../adapters/identity/raft-identity-adapter.ts";
import { EnterpriseOidcIdentityAdapter } from "../adapters/identity/enterprise-oidc-identity-adapter.ts";

const policy = {
  issuer: "https://identity.fixture.example",
  audience: "company-os",
  now: () => "2026-08-18T08:00:00.000Z",
};

test("Raft identity claims map into provider-neutral Company OS identity", async () => {
  const adapter = new RaftIdentityAdapter(async () => ({
    subject: "raft-user-fixture",
    organization: "company-fixture",
    displayName: "Demo Operator",
    issuer: policy.issuer,
    audience: policy.audience,
    expiresAt: "2026-08-18T09:00:00.000Z",
  }), undefined, policy);

  const identity = await adapter.getCurrentIdentity();

  assert.deepEqual(identity, {
    actorId: "raft-user-fixture",
    organizationId: "company-fixture",
    displayName: "Demo Operator",
    assurance: "HOST_ASSERTED",
  });
});

test("invalid Raft claims are rejected at the adapter boundary", async () => {
  const adapter = new RaftIdentityAdapter(async () => ({ subject: "" }), undefined, policy);

  await assert.rejects(adapter.getCurrentIdentity(), /Invalid Raft identity claims/);
});

test("enterprise OIDC and Raft identity share issuer, audience, tenant and expiry semantics", async () => {
  const adapter = new EnterpriseOidcIdentityAdapter(async () => ({
    subject: "employee-one",
    organization: "company-one",
    displayName: "Employee One",
    issuer: policy.issuer,
    audience: policy.audience,
    expiresAt: "2026-08-18T09:00:00.000Z",
  }), async () => ({
    id: "receipt-one",
    principalId: "employee-one",
    authorizedAt: "2026-08-18T08:00:00.000Z",
  }), policy);

  assert.equal((await adapter.getCurrentIdentity())?.assurance, "ENTERPRISE_ASSERTED");
  await assert.rejects(
    new EnterpriseOidcIdentityAdapter(async () => ({
      subject: "employee-one",
      organization: "company-one",
      displayName: "Employee One",
      issuer: policy.issuer,
      audience: "wrong-product",
      expiresAt: "2026-08-18T09:00:00.000Z",
    }), undefined, policy).getCurrentIdentity(),
    /audience/i,
  );
});
