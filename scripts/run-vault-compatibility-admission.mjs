import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVaultKvV2Client, createVaultLeaseBroker } from "../brokers/vault-secret-broker/index.mjs";

const VAULT_IMAGE = "hashicorp/vault@sha256:4e33b126a59c0c333b76fb4e894722462659a6bec7c48c9ee8cea56fccfd2569";
const suffix = `${process.pid}-${randomBytes(4).toString("hex")}`;
const container = `company-os-vault-compat-${suffix}`;
const directory = await mkdtemp(join(tmpdir(), "company-os-vault-compat-"));
const rootToken = randomBytes(32).toString("base64url");
const firstMaterial = randomBytes(32).toString("base64url");
const rotatedMaterial = randomBytes(32).toString("base64url");
let cleaning = false;

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  try { docker("rm", "--force", container); } catch { /* already absent */ }
  await rm(directory, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

async function vaultRequest(origin, method, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(5_000),
    headers: { "x-vault-token": rootToken, accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`VAULT_COMPAT_CONFIGURATION_FAILED:${response.status}:${path}`);
  }
  return payload;
}

async function waitForVault(origin) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/v1/sys/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.status === 200) return;
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("VAULT_COMPAT_NOT_READY");
}

async function complete(broker, intent, authorization, material) {
  const session = await broker.beginReferenceManagement(intent, authorization);
  const token = new URL(session.managementUrl).searchParams.get("token");
  assert.ok(token);
  const result = await broker.completeReferenceManagement(session.id, token, material);
  assert.equal(result.ok, true);
  return result.reference;
}

try {
  docker("run", "--detach", "--name", container, "--cap-add=IPC_LOCK",
    "--publish", "127.0.0.1::8200", "--env", `VAULT_DEV_ROOT_TOKEN_ID=${rootToken}`,
    "--env", "VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200", VAULT_IMAGE, "server", "-dev");
  const port = docker("port", container, "8200/tcp").match(/:(\d+)$/)?.[1];
  assert.ok(port);
  const origin = `http://127.0.0.1:${port}`;
  await waitForVault(origin);

  await vaultRequest(origin, "POST", "/v1/sys/mounts/company-os", {
    type: "kv", description: "Company OS synthetic compatibility data", options: { version: "2" },
  });
  await vaultRequest(origin, "POST", "/v1/sys/auth/approle", {
    type: "approle", description: "Company OS Broker compatibility admission",
  });
  await vaultRequest(origin, "PUT", "/v1/sys/policies/acl/company-os-broker", {
    policy: ["path \"company-os/data/staging/*\" {",
      "  capabilities = [\"create\", \"update\", \"read\"]", "}"].join("\n"),
  });
  await vaultRequest(origin, "POST", "/v1/auth/approle/role/company-os-broker", {
    token_policies: ["company-os-broker"], token_ttl: "5m", token_max_ttl: "10m",
    secret_id_ttl: "10m", secret_id_num_uses: 10,
  });
  const role = await vaultRequest(origin, "GET", "/v1/auth/approle/role/company-os-broker/role-id");
  const secret = await vaultRequest(origin, "POST", "/v1/auth/approle/role/company-os-broker/secret-id", {});
  assert.equal(typeof role?.data?.role_id, "string");
  assert.equal(typeof secret?.data?.secret_id, "string");

  const vaultClient = createVaultKvV2Client({ address: origin, allowInsecureLoopback: true,
    roleId: role.data.role_id, secretId: secret.data.secret_id });
  assert.equal(await vaultClient.health(), true);
  const brokerOptions = { stateFile: join(directory, "lease-state.json"),
    referenceStateFile: join(directory, "reference-state.json"), references: [], vaultClient,
    managementPublicOrigin: "http://127.0.0.1:4321",
    managementSigningKey: randomBytes(48).toString("base64url"),
    managementProfiles: [{ purpose: "MODEL_PROVIDER", providerAdapterId: "compat-provider",
      mount: "company-os", pathPrefix: "staging", field: "provider_token",
      environmentVariable: "COMPAT_PROVIDER_TOKEN" }] };
  const broker = createVaultLeaseBroker(brokerOptions);
  const companyId = "compat-company"; const referenceId = "compat-reference";
  const created = await complete(broker, { companyId, referenceId, operation: "CREATE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "compat-provider", expectedVersion: null },
  "compat-create-authorization", firstMaterial);
  assert.equal(created.currentVersion, 1);

  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  const oldLease = await broker.issueLease({ companyId, secretReferenceId: referenceId,
    expectedVersion: 1, consumerId: "compat-provider", workAttemptId: "compat-attempt-one",
    reasonCode: "MODEL_INFERENCE", expiresAt }, "compat-lease-authorization-one");
  assert.equal(oldLease.ok, true);
  const firstRedemption = await broker.redeemLease({ companyId, leaseId: oldLease.value.id,
    consumerId: "compat-provider", workAttemptId: "compat-attempt-one", expectedVersion: 1 });
  assert.equal(firstRedemption.value, firstMaterial);

  const rotated = await complete(broker, { companyId, referenceId, operation: "ROTATE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "compat-provider", expectedVersion: 1 },
  "compat-rotate-authorization", rotatedMaterial);
  assert.equal(rotated.currentVersion, 2);
  await assert.rejects(broker.redeemLease({ companyId, leaseId: oldLease.value.id,
    consumerId: "compat-provider", workAttemptId: "compat-attempt-one", expectedVersion: 1 }),
  /SECRET_REFERENCE_CHANGED/);

  const currentLease = await broker.issueLease({ companyId, secretReferenceId: referenceId,
    expectedVersion: 2, consumerId: "compat-provider", workAttemptId: "compat-attempt-two",
    reasonCode: "MODEL_INFERENCE", expiresAt }, "compat-lease-authorization-two");
  assert.equal(currentLease.ok, true);
  const currentRedemption = await broker.redeemLease({ companyId, leaseId: currentLease.value.id,
    consumerId: "compat-provider", workAttemptId: "compat-attempt-two", expectedVersion: 2 });
  assert.equal(currentRedemption.value, rotatedMaterial);

  await complete(broker, { companyId, referenceId, operation: "SUSPEND",
    purpose: "MODEL_PROVIDER", providerAdapterId: "compat-provider", expectedVersion: 2 },
  "compat-suspend-authorization");
  const deniedLease = await broker.issueLease({ companyId, secretReferenceId: referenceId,
    expectedVersion: 2, consumerId: "compat-provider", workAttemptId: "compat-attempt-three",
    reasonCode: "MODEL_INFERENCE", expiresAt }, "compat-lease-authorization-three");
  assert.deepEqual(deniedLease, { ok: false, error: { code: "SECRET_REFERENCE_INACTIVE", retryable: false } });
  const revoked = await complete(broker, { companyId, referenceId, operation: "REVOKE",
    purpose: "MODEL_PROVIDER", providerAdapterId: "compat-provider", expectedVersion: 2 },
  "compat-revoke-authorization");
  assert.equal(revoked.status, "REVOKED");

  const restarted = createVaultLeaseBroker(brokerOptions);
  assert.equal((await restarted.describe(companyId, referenceId)).status, "REVOKED");
  const persisted = (await Promise.all([readFile(brokerOptions.stateFile, "utf8"),
    readFile(brokerOptions.referenceStateFile, "utf8")])).join("\n");
  assert.equal(persisted.includes(firstMaterial), false);
  assert.equal(persisted.includes(rotatedMaterial), false);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, status: "PASS", vaultImage: VAULT_IMAGE,
    auth: "APPROLE", engine: "KV_V2",
    lifecycle: ["CREATE", "LEASE", "REDEEM", "ROTATE", "FENCE", "SUSPEND", "REVOKE", "RESTART"] })}\n`);
} finally {
  await cleanup();
}
