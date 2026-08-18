import assert from "node:assert/strict";
import test from "node:test";

import { RaftIdentityAdapter } from "../adapters/identity/raft-identity-adapter.ts";

test("Raft identity claims map into provider-neutral Company OS identity", async () => {
  const adapter = new RaftIdentityAdapter(async () => ({
    subject: "raft-user-fixture",
    organization: "company-fixture",
    displayName: "Demo Operator",
  }));

  const identity = await adapter.getCurrentIdentity();

  assert.deepEqual(identity, {
    actorId: "raft-user-fixture",
    organizationId: "company-fixture",
    displayName: "Demo Operator",
    assurance: "HOST_ASSERTED",
  });
});

test("invalid Raft claims are rejected at the adapter boundary", async () => {
  const adapter = new RaftIdentityAdapter(async () => ({ subject: "" }));

  await assert.rejects(adapter.getCurrentIdentity(), /Invalid Raft identity claims/);
});
