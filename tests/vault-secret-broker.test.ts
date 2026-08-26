import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { once } from "node:events";
import { createServer } from "node:http";

import { createVaultKvV2Client, createVaultLeaseBroker,
  createVaultSecretBrokerHttpService } from "../brokers/vault-secret-broker/index.mjs";
import { createVaultSecretBrokerService } from "../brokers/vault-secret-broker/service-entry.mjs";

const FIXTURE_MATERIAL = ["synthetic", "provider", "material"].join("-");
const FIXTURE_SECRET_ID = ["synthetic", "secret", "id"].join("-");
const ROTATED_FIXTURE = ["rotated", "fixture"].join("-");

const reference = {
  id: "secret-model-one", companyId: "company-one", purpose: "MODEL_PROVIDER",
  providerAdapterId: "model-provider-one", currentVersion: 4, status: "ACTIVE",
  vault: { mount: "company-os", path: "staging/company-one/model-provider-one", version: 4,
    field: "api_key", environmentVariable: "OPENAI_API_KEY" },
};
const intent = { companyId: "company-one", secretReferenceId: "secret-model-one", expectedVersion: 4,
  consumerId: "model-provider-one", workAttemptId: "attempt-one", reasonCode: "MODEL_INFERENCE",
  expiresAt: "2026-08-26T12:05:00.000Z" };

test("Vault redemption publishes a separate execution-only OpenAPI contract", async () => {
  const source = await readFile(new URL("../brokers/vault-secret-broker/redemption-openapi.json", import.meta.url), "utf8");
  const contract = JSON.parse(source);
  assert.equal(contract.openapi, "3.1.0");
  assert.ok(contract.paths["/v1/redemptions"].post);
  assert.deepEqual(contract.security, [{ executionBearerAuth: [] }]);
  assert.doesNotMatch(source, /synthetic-provider-material|api_key|staging\/company-one/);
});

test("Vault Broker persists only an opaque exact lease and redeems material only at the execution boundary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-broker-"));
  const reads: unknown[] = [];
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "state.json"), references: [reference],
    now: () => "2026-08-26T12:00:00.000Z", vaultClient: { async readKvVersion(input: unknown) {
      reads.push(input); return { version: 4, data: { api_key: FIXTURE_MATERIAL } };
    } } });

  assert.deepEqual(await broker.describe("company-one", "secret-model-one"), {
    id: "secret-model-one", companyId: "company-one", purpose: "MODEL_PROVIDER",
    providerAdapterId: "model-provider-one", currentVersion: 4, status: "ACTIVE",
  });
  const issued = await broker.issueLease(intent, "authorization-one");
  assert.equal(issued.ok, true); assert.match(issued.value.id, /^lease-[a-f0-9]{32}$/);
  assert.match(issued.value.attestationDigest, /^sha256:[a-f0-9]{64}$/);

  const material = await broker.redeemLease({ leaseId: issued.value.id, companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one", expectedVersion: 4 });
  assert.deepEqual(material, { environmentVariable: "OPENAI_API_KEY", value: FIXTURE_MATERIAL,
    expiresAt: intent.expiresAt });
  assert.deepEqual(reads, [{ mount: "company-os", path: "staging/company-one/model-provider-one", version: 4 }]);
  const stored = await readFile(join(directory, "state.json"), "utf8");
  assert.doesNotMatch(stored, /synthetic-provider-material|api_key|OPENAI_API_KEY|staging\/company-one/);
});

test("Vault Broker rejects binding/version drift and revoked or expired redemption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-broker-"));
  let current = "2026-08-26T12:00:00.000Z";
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "state.json"), references: [reference],
    now: () => current, vaultClient: { async readKvVersion() { return { version: 4, data: { api_key: "fixture" } }; } } });
  const issued = await broker.issueLease(intent, "authorization-one"); assert.equal(issued.ok, true);
  await assert.rejects(broker.redeemLease({ leaseId: issued.value.id, companyId: "company-one",
    consumerId: "different-provider", workAttemptId: "attempt-one", expectedVersion: 4 }), /SECRET_LEASE_BINDING_MISMATCH/);
  await assert.rejects(broker.redeemLease({ leaseId: issued.value.id, companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one", expectedVersion: 3 }), /SECRET_LEASE_VERSION_MISMATCH/);
  await broker.revokeLease("company-one", issued.value.id, "WORK_ATTEMPT_TERMINATED");
  await broker.revokeLease("company-one", issued.value.id, "WORK_ATTEMPT_TERMINATED");
  await assert.rejects(broker.redeemLease({ leaseId: issued.value.id, companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one", expectedVersion: 4 }), /SECRET_LEASE_REVOKED/);

  const second = await broker.issueLease({ ...intent, workAttemptId: "attempt-two",
    expiresAt: "2026-08-26T12:06:00.000Z" }, "authorization-two"); assert.equal(second.ok, true);
  current = "2026-08-26T12:06:01.000Z";
  await assert.rejects(broker.redeemLease({ leaseId: second.value.id, companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-two", expectedVersion: 4 }), /SECRET_LEASE_EXPIRED/);
});

test("Vault Broker fails closed on stale references and Vault version drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-broker-"));
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "state.json"), references: [reference],
    now: () => "2026-08-26T12:00:00.000Z", vaultClient: { async readKvVersion() {
      return { version: 5, data: { api_key: ROTATED_FIXTURE } };
    } } });
  const stale = await broker.issueLease({ ...intent, expectedVersion: 3 }, "authorization-one");
  assert.deepEqual(stale, { ok: false, error: { code: "SECRET_REFERENCE_VERSION_MISMATCH", retryable: false } });
  const issued = await broker.issueLease(intent, "authorization-one"); assert.equal(issued.ok, true);
  await assert.rejects(broker.redeemLease({ leaseId: issued.value.id, companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one", expectedVersion: 4 }), /VAULT_SECRET_VERSION_MISMATCH/);
});

test("Vault KV v2 client uses AppRole in memory and reads and writes exact versions over the official API shape", async () => {
  const requests: Array<{ method: string; path: string; token: string | null; namespace: string | null; body: unknown }> = [];
  const vault = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const path = new URL(request.url ?? "/", "http://vault.test").pathname;
    requests.push({ method: request.method ?? "GET", path, token: request.headers["x-vault-token"] as string ?? null,
      namespace: request.headers["x-vault-namespace"] as string ?? null, body });
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value));
    };
    if (path === "/v1/sys/health") return send(200, { initialized: true, sealed: false });
    if (path === "/v1/auth/approle/login") return send(200, { auth: {
      client_token: "synthetic-short-lived-vault-token", lease_duration: 120, renewable: false,
    } });
    if (request.method === "POST" && path === "/v1/company-os/data/staging/company-one/model-provider-one") {
      return send(200, { data: { version: 5 } });
    }
    if (path === "/v1/company-os/data/staging/company-one/model-provider-one") return send(200, { data: {
      data: { api_key: FIXTURE_MATERIAL }, metadata: { version: 4, deletion_time: "", destroyed: false },
    } });
    return send(404, { errors: ["not found"] });
  });
  vault.listen(0, "127.0.0.1"); await once(vault, "listening");
  const address = vault.address(); assert.ok(address && typeof address !== "string");
  try {
    const client = createVaultKvV2Client({ address: `http://127.0.0.1:${address.port}`,
      allowInsecureLoopback: true, namespace: "staging", authMount: "approle",
      roleId: "synthetic-role-id", secretId: FIXTURE_SECRET_ID, requestTimeoutMs: 2_000,
      nowMs: () => Date.parse("2026-08-26T12:00:00.000Z") });
    assert.equal(await client.health(), true);
    assert.deepEqual(await client.readKvVersion({ mount: "company-os",
      path: "staging/company-one/model-provider-one", version: 4 }), {
      version: 4, data: { api_key: FIXTURE_MATERIAL },
    });
    assert.deepEqual(await client.writeKvVersion({ mount: "company-os", path: "staging/company-one/model-provider-one",
      field: "api_key", value: ROTATED_FIXTURE, expectedVersion: 4 }), { version: 5 });
    assert.deepEqual(requests[1].body, { role_id: "synthetic-role-id", secret_id: FIXTURE_SECRET_ID });
    assert.equal(requests[2].token, "synthetic-short-lived-vault-token");
    assert.equal(requests[2].namespace, "staging");
    assert.equal(requests[2].path.includes("?"), false);
    assert.deepEqual(requests[3].body, { data: { api_key: ROTATED_FIXTURE }, options: { cas: 4 } });
    assert.equal(requests[3].token, "synthetic-short-lived-vault-token");
  } finally { vault.close(); await once(vault, "close"); }
});

test("Vault Broker HTTP service separates control authority from secret redemption authority", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-http-"));
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "state.json"), references: [reference],
    now: () => "2026-08-26T12:00:00.000Z", vaultClient: { async health() { return true; },
      async readKvVersion() { return { version: 4, data: { api_key: FIXTURE_MATERIAL } }; } } });
  const service = createVaultSecretBrokerHttpService({ broker, controlBearerToken: "synthetic-control-token",
    executionBearerToken: "synthetic-execution-token" });
  service.listen(0, "127.0.0.1"); await once(service, "listening");
  const address = service.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const call = (path: string, token: string, body?: unknown) => fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const issuedResponse = await call("/v1/leases", "synthetic-control-token",
      { schemaVersion: 1, intent, authorizationReceiptId: "authorization-one" });
    assert.equal(issuedResponse.status, 201); const issued = await issuedResponse.json();
    assert.doesNotMatch(JSON.stringify(issued), /synthetic-provider-material|api_key|OPENAI_API_KEY/);

    const redemption = { schemaVersion: 1, leaseId: issued.lease.id, companyId: "company-one",
      consumerId: "model-provider-one", workAttemptId: "attempt-one" };
    assert.equal((await call("/v1/redemptions", "synthetic-control-token", redemption)).status, 401);
    const redeemedResponse = await call("/v1/redemptions", "synthetic-execution-token", redemption);
    assert.equal(redeemedResponse.status, 200); assert.equal(redeemedResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await redeemedResponse.json(), { material: { environmentVariable: "OPENAI_API_KEY",
      value: FIXTURE_MATERIAL, expiresAt: intent.expiresAt } });

    const revoked = await call(`/v1/companies/company-one/leases/${issued.lease.id}/revocations`,
      "synthetic-control-token", { schemaVersion: 1, reasonCode: "WORK_ATTEMPT_TERMINATED" });
    assert.equal(revoked.status, 202);
    const denied = await call("/v1/redemptions", "synthetic-execution-token", redemption);
    assert.equal(denied.status, 422); assert.deepEqual(await denied.json(), { error: { code: "SECRET_LEASE_REVOKED" } });
  } finally { service.close(); await once(service, "close"); }
});

test("Vault Broker service loads only file-injected credentials and private reference coordinates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-service-"));
  const { writeFile } = await import("node:fs/promises");
  const files = {
    role: join(directory, "role-id"), secret: join(directory, "secret-id"), control: join(directory, "control-token"),
    execution: join(directory, "execution-token"), management: join(directory, "management-key"),
    references: join(directory, "references.json"),
  };
  await Promise.all([
    writeFile(files.role, "synthetic-role-id", { mode: 0o600 }),
    writeFile(files.secret, FIXTURE_SECRET_ID, { mode: 0o600 }),
    writeFile(files.control, "synthetic-control-token", { mode: 0o600 }),
    writeFile(files.execution, "synthetic-execution-token", { mode: 0o600 }),
    writeFile(files.management, ["fixture", "management", "key", "sufficient", "length"].join("-"), { mode: 0o600 }),
    writeFile(files.references, JSON.stringify({ schemaVersion: 1, references: [reference], managementProfiles: [{
      purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", mount: "company-os",
      pathPrefix: "staging", field: "api_key", environmentVariable: "OPENAI_API_KEY",
    }] }), { mode: 0o600 }),
  ]);
  const service = createVaultSecretBrokerService({ COMPANY_OS_VAULT_ADDRESS: "http://127.0.0.1:8200",
    COMPANY_OS_VAULT_ALLOW_INSECURE_LOOPBACK: "true", COMPANY_OS_VAULT_ROLE_ID_FILE: files.role,
    COMPANY_OS_VAULT_SECRET_ID_FILE: files.secret, COMPANY_OS_VAULT_BROKER_CONTROL_BEARER_TOKEN_FILE: files.control,
    COMPANY_OS_VAULT_BROKER_EXECUTION_BEARER_TOKEN_FILE: files.execution,
    COMPANY_OS_VAULT_BROKER_MANAGEMENT_SIGNING_KEY_FILE: files.management,
    COMPANY_OS_VAULT_BROKER_PUBLIC_URL: "http://127.0.0.1:4321",
    COMPANY_OS_VAULT_BROKER_REFERENCES_FILE: files.references,
    COMPANY_OS_VAULT_BROKER_STATE_FILE: join(directory, "state.json"),
    COMPANY_OS_VAULT_BROKER_REFERENCE_STATE_FILE: join(directory, "reference-state.json") });
  assert.equal(service.listening, false);
  assert.throws(() => createVaultSecretBrokerService({ COMPANY_OS_VAULT_ADDRESS: "http://vault.example",
    COMPANY_OS_VAULT_ROLE_ID_FILE: files.role, COMPANY_OS_VAULT_SECRET_ID_FILE: files.secret,
    COMPANY_OS_VAULT_BROKER_CONTROL_BEARER_TOKEN_FILE: files.control,
    COMPANY_OS_VAULT_BROKER_EXECUTION_BEARER_TOKEN_FILE: files.execution,
    COMPANY_OS_VAULT_BROKER_MANAGEMENT_SIGNING_KEY_FILE: files.management,
    COMPANY_OS_VAULT_BROKER_PUBLIC_URL: "http://127.0.0.1:4321",
    COMPANY_OS_VAULT_BROKER_REFERENCES_FILE: files.references,
    COMPANY_OS_VAULT_BROKER_STATE_FILE: join(directory, "unsafe-state.json") }), /VAULT_TLS_REQUIRED/);
});

test("Vault Broker owns create, rotate, suspend and revoke sessions without persisting material", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-management-"));
  const writes: unknown[] = [];
  const options = { stateFile: join(directory, "lease-state.json"),
    referenceStateFile: join(directory, "reference-state.json"), references: [],
    managementPublicOrigin: "http://127.0.0.1:4321", managementSigningKey: ["fixture", "management", "key", "sufficient", "length"].join("-"),
    managementProfiles: [{ purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one",
      mount: "company-os", pathPrefix: "staging", field: "api_key", environmentVariable: "OPENAI_API_KEY" }],
    now: () => "2026-08-26T12:00:00.000Z", vaultClient: { async health() { return true; },
      async readKvVersion() { return { version: 1, data: { api_key: FIXTURE_MATERIAL } }; },
      async writeKvVersion(input: unknown) { writes.push(input); return { version: writes.length }; } } };
  const broker = createVaultLeaseBroker(options);
  const create = await broker.beginReferenceManagement({ companyId: "company-one", referenceId: "new-model-key",
    operation: "CREATE", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", expectedVersion: null },
  "authorization-one");
  const createToken = new URL(create.managementUrl).searchParams.get("token"); assert.ok(createToken);
  await broker.completeReferenceManagement(create.id, createToken, FIXTURE_MATERIAL);
  assert.deepEqual(await broker.referenceManagementResult("company-one", create.id), { status: "COMPLETED",
    reference: { id: "new-model-key", companyId: "company-one", purpose: "MODEL_PROVIDER",
      providerAdapterId: "model-provider-one", currentVersion: 1, status: "ACTIVE" } });
  const preRotationLease = await broker.issueLease({ companyId: "company-one", secretReferenceId: "new-model-key",
    expectedVersion: 1, consumerId: "model-provider-one", workAttemptId: "attempt-one",
    reasonCode: "MODEL_INFERENCE", expiresAt: "2026-08-26T12:05:00.000Z" }, "authorization-five");
  assert.equal(preRotationLease.ok, true);

  const rotate = await broker.beginReferenceManagement({ companyId: "company-one", referenceId: "new-model-key",
    operation: "ROTATE", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", expectedVersion: 1 },
  "authorization-two");
  await broker.completeReferenceManagement(rotate.id, new URL(rotate.managementUrl).searchParams.get("token"), ROTATED_FIXTURE);
  assert.equal((await broker.describe("company-one", "new-model-key")).currentVersion, 2);
  await assert.rejects(broker.redeemLease({ leaseId: preRotationLease.value.id, companyId: "company-one",
    consumerId: "model-provider-one", workAttemptId: "attempt-one", expectedVersion: 1 }), /SECRET_REFERENCE_CHANGED/);

  const suspend = await broker.beginReferenceManagement({ companyId: "company-one", referenceId: "new-model-key",
    operation: "SUSPEND", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", expectedVersion: 2 },
  "authorization-three");
  await broker.completeReferenceManagement(suspend.id, new URL(suspend.managementUrl).searchParams.get("token"));
  assert.equal((await broker.describe("company-one", "new-model-key")).status, "SUSPENDED");

  const revoke = await broker.beginReferenceManagement({ companyId: "company-one", referenceId: "new-model-key",
    operation: "REVOKE", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", expectedVersion: 2 },
  "authorization-four");
  await broker.completeReferenceManagement(revoke.id, new URL(revoke.managementUrl).searchParams.get("token"));
  assert.equal((await broker.describe("company-one", "new-model-key")).status, "REVOKED");
  assert.deepEqual(writes, [
    { mount: "company-os", path: "staging/company-one/new-model-key", field: "api_key", value: FIXTURE_MATERIAL,
      expectedVersion: 0 },
    { mount: "company-os", path: "staging/company-one/new-model-key", field: "api_key", value: ROTATED_FIXTURE,
      expectedVersion: 1 },
  ]);
  const [leaseState, referenceState] = await Promise.all([
    readFile(join(directory, "lease-state.json"), "utf8").catch(() => ""),
    readFile(join(directory, "reference-state.json"), "utf8"),
  ]);
  assert.doesNotMatch(leaseState + referenceState, new RegExp(`${FIXTURE_MATERIAL}|${ROTATED_FIXTURE}`));
  const restarted = createVaultLeaseBroker(options);
  assert.equal((await restarted.describe("company-one", "new-model-key")).status, "REVOKED");
});

test("Vault Broker serves a one-time same-origin management form", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-management-http-"));
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "lease-state.json"),
    referenceStateFile: join(directory, "reference-state.json"), references: [],
    managementPublicOrigin: "http://127.0.0.1:1", managementSigningKey: ["fixture", "management", "key", "sufficient", "length"].join("-"),
    managementProfiles: [{ purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one",
      mount: "company-os", pathPrefix: "staging", field: "api_key", environmentVariable: "OPENAI_API_KEY" }],
    now: () => "2026-08-26T12:00:00.000Z", vaultClient: { async health() { return true; },
      async readKvVersion() { return { version: 1, data: { api_key: FIXTURE_MATERIAL } }; },
      async writeKvVersion() { return { version: 1 }; } } });
  const service = createVaultSecretBrokerHttpService({ broker, controlBearerToken: "synthetic-control-token",
    executionBearerToken: "synthetic-execution-token", managementPublicOriginFromRequest: true });
  service.listen(0, "127.0.0.1"); await once(service, "listening");
  const address = service.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const started = await fetch(`${origin}/v1/reference-management-sessions`, { method: "POST", headers: {
      authorization: `Bearer ${"synthetic-control-token"}`, "content-type": "application/json" }, body: JSON.stringify({
      schemaVersion: 1, authorizationReceiptId: "authorization-one", intent: { companyId: "company-one",
        referenceId: "new-model-key", operation: "CREATE", purpose: "MODEL_PROVIDER",
        providerAdapterId: "model-provider-one", expectedVersion: null } }) });
    assert.equal(started.status, 201); const session = (await started.json()).session;
    const managementUrl = new URL(session.managementUrl); assert.equal(managementUrl.origin, origin);
    const page = await fetch(managementUrl); assert.equal(page.status, 200);
    const html = await page.text(); assert.match(html, /Create secret reference/); assert.doesNotMatch(html, /api_key|OPENAI_API_KEY/);
    const token = managementUrl.searchParams.get("token"); assert.ok(token);
    const denied = await fetch(`${origin}/manage/${session.id}/complete`, { method: "POST", headers: {
      authorization: `Bearer ${"synthetic-control-token"}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "wrong-token", material: FIXTURE_MATERIAL }) });
    assert.equal(denied.status, 401);
    const completed = await fetch(`${origin}/manage/${session.id}/complete`, { method: "POST", headers: {
      "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, material: FIXTURE_MATERIAL }) });
    assert.equal(completed.status, 200); assert.doesNotMatch(await completed.text(), new RegExp(FIXTURE_MATERIAL));
    const result = await fetch(`${origin}/v1/companies/company-one/reference-management-sessions/${session.id}`, {
      headers: { authorization: `Bearer ${"synthetic-control-token"}` } });
    assert.equal((await result.json()).result.status, "COMPLETED");
  } finally { service.close(); await once(service, "close"); }
});

test("Vault management records a stable failure without retaining submitted material", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-vault-management-failure-"));
  const broker = createVaultLeaseBroker({ stateFile: join(directory, "lease-state.json"),
    referenceStateFile: join(directory, "reference-state.json"), references: [],
    managementPublicOrigin: "http://127.0.0.1:4321",
    managementSigningKey: ["fixture", "management", "key", "sufficient", "length"].join("-"),
    managementProfiles: [{ purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one",
      mount: "company-os", pathPrefix: "staging", field: "api_key", environmentVariable: "OPENAI_API_KEY" }],
    now: () => "2026-08-26T12:00:00.000Z", vaultClient: { async health() { return false; },
      async readKvVersion() { throw new Error("VAULT_UNAVAILABLE"); },
      async writeKvVersion() { throw new Error("VAULT_UNAVAILABLE"); } } });
  const session = await broker.beginReferenceManagement({ companyId: "company-one", referenceId: "new-model-key",
    operation: "CREATE", purpose: "MODEL_PROVIDER", providerAdapterId: "model-provider-one", expectedVersion: null },
  "authorization-one");
  const result = await broker.completeReferenceManagement(session.id,
    new URL(session.managementUrl).searchParams.get("token"), FIXTURE_MATERIAL);
  assert.deepEqual(result, { ok: false, error: { code: "VAULT_UNAVAILABLE", retryable: true } });
  assert.deepEqual(await broker.referenceManagementResult("company-one", session.id), {
    status: "FAILED", code: "VAULT_UNAVAILABLE", retryable: true,
  });
  assert.doesNotMatch(await readFile(join(directory, "reference-state.json"), "utf8"), new RegExp(FIXTURE_MATERIAL));
});
