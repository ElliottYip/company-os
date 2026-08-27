import assert from "node:assert/strict";
import test from "node:test";

import { bootstrapReferenceVault, type VaultBootstrapRequest } from
  "../adapters/config/vault-reference-bootstrap.ts";

const unsealKey = "synthetic-unseal-key-material";
const rootToken = "synthetic-root-token-material";
const roleId = "synthetic-role-id-material";
const secretId = "synthetic-secret-id-material";

async function rejection(operation: () => Promise<unknown>): Promise<Error> {
  try { await operation(); throw new Error("EXPECTED_REJECTION"); }
  catch (error) {
    if (error instanceof Error && error.message !== "EXPECTED_REJECTION") return error;
    throw error;
  }
}

test("reference Vault bootstrap follows the official init, unseal, KV v2 and AppRole API chain", async () => {
  const calls: VaultBootstrapRequest[] = [];
  const responses: unknown[] = [
    { initialized: false }, { keys_base64: [unsealKey], root_token: rootToken }, { sealed: false },
    {}, {}, {}, {}, { data: { role_id: roleId } }, { data: { secret_id: secretId } },
    { auth: { client_token: "synthetic-short-lived-token" } }, {},
  ];
  const written: unknown[] = [];
  const result = await bootstrapReferenceVault({ siteId: "company-os-hong-kong",
    transport: { async request(input) { calls.push(input); return responses.shift(); } },
    secretSink: { async writeInitialization(value) { written.push(value); },
      async writeAppRole(value) { written.push(value); },
      async finalizeInitialization(value) { written.push(value); } } });
  assert.deepEqual(result, { schemaVersion: 1, status: "VAULT_BOOTSTRAPPED_NOT_STARTED",
    authMethod: "APPROLE", secretsEngine: "KV_V2", initialRootTokenRevoked: true });
  assert.deepEqual(calls.map(({ method, path }) => [method, path]), [
    ["GET", "/v1/sys/init"], ["POST", "/v1/sys/init"], ["POST", "/v1/sys/unseal"],
    ["POST", "/v1/sys/mounts/company-os"], ["POST", "/v1/sys/auth/approle"],
    ["PUT", "/v1/sys/policies/acl/company-os-broker"],
    ["POST", "/v1/auth/approle/role/company-os-broker"],
    ["GET", "/v1/auth/approle/role/company-os-broker/role-id"],
    ["POST", "/v1/auth/approle/role/company-os-broker/secret-id"],
    ["POST", "/v1/auth/approle/login"],
    ["POST", "/v1/auth/token/revoke-self"],
  ]);
  assert.deepEqual(calls[1].body, { secret_shares: 1, secret_threshold: 1 });
  assert.match(JSON.stringify(calls[5].body), /company-os-hong-kong\/model-providers/);
  assert.equal(calls.slice(3, 9).every(({ token }) => token === rootToken), true);
  assert.deepEqual(written, [{ schemaVersion: 1, seal: "SHAMIR", secretShares: 1,
    secretThreshold: 1, unsealKeyBase64: unsealKey, initialRootToken: rootToken }, { roleId, secretId },
  { schemaVersion: 1, seal: "SHAMIR", secretShares: 1, secretThreshold: 1,
    unsealKeyBase64: unsealKey, initialRootTokenRevoked: true }]);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-/);
});

test("reference Vault bootstrap refuses an initialized Vault instead of taking it over", async () => {
  let writes = 0;
  await assert.rejects(bootstrapReferenceVault({ siteId: "company-os-hong-kong",
    transport: { async request() { return { initialized: true }; } },
    secretSink: { async writeInitialization() { writes += 1; }, async writeAppRole() { writes += 1; },
      async finalizeInitialization() { writes += 1; } } }),
  /VAULT_REFERENCE_ALREADY_INITIALIZED_REVIEW_REQUIRED/);
  assert.equal(writes, 0);
});

test("reference Vault bootstrap fails closed before unseal on malformed initialization output", async () => {
  let requests = 0;
  const error = await rejection(() => bootstrapReferenceVault({ siteId: "company-os-hong-kong",
    transport: { async request() { requests += 1; return requests === 1 ? { initialized: false } :
      { keys_base64: [], root_token: rootToken }; } },
    secretSink: { async writeInitialization() { throw new Error("must not write"); },
      async writeAppRole() { throw new Error("must not write"); },
      async finalizeInitialization() { throw new Error("must not write"); } } }));
  assert.match(error.message, /VAULT_REFERENCE_BOOTSTRAP_FAILED_REQUIRES_REVIEW/);
  assert.equal(requests, 2);
});

test("reference Vault bootstrap never reflects secret material in a post-init failure", async () => {
  let requests = 0;
  const error = await rejection(() => bootstrapReferenceVault({ siteId: "company-os-hong-kong",
    transport: { async request() { requests += 1;
      if (requests === 1) return { initialized: false };
      if (requests === 2) return { keys_base64: [unsealKey], root_token: rootToken };
      throw new Error(`upstream leaked ${rootToken}`); } },
    secretSink: { async writeInitialization() {}, async writeAppRole() {}, async finalizeInitialization() {} } }));
  assert.equal(error.message, "VAULT_REFERENCE_BOOTSTRAP_FAILED_REQUIRES_REVIEW");
  assert.doesNotMatch(error.message, /synthetic-root/);
});
