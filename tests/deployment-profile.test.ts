import assert from "node:assert/strict";
import test from "node:test";

import { selectDeploymentProfile } from "../adapters/deployment/select-deployment-profile.ts";

test("managed cloud uses Raft Identity as a replaceable default adapter", () => {
  const profile = selectDeploymentProfile("managed-cloud");

  assert.equal(profile.identityAdapter, "raft-identity");
  assert.equal(profile.businessCodeProfile, "shared");
});

test("self hosted changes adapter selections without forking business code", () => {
  const profile = selectDeploymentProfile("self-hosted");

  assert.equal(profile.identityAdapter, "local-oidc");
  assert.equal(profile.businessCodeProfile, "shared");
});
