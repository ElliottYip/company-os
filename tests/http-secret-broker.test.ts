import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { loadFormalSecretBroker } from "../adapters/secrets/load-formal-secret-broker.ts";
import { IssueSecretLease } from "../application/issue-secret-lease.ts";
import {
  createSecretBrokerRuntimePort,
  validateHttpSecretBrokerConfiguration,
} from "../brokers/http-secret-broker/index.mjs";

test("installed HTTP Secret Broker issues only an opaque audited lease and survives adapter reconstruction", async () => {
  const requests: { method: string; path: string; authorization: string | null; body: unknown }[] = [];
  const broker = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const path = new URL(request.url ?? "/", "http://broker.test").pathname;
    requests.push({ method: request.method ?? "GET", path, authorization: request.headers.authorization ?? null, body });
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value));
    };
    if (path === "/v1/health") return send(200, { status: "HEALTHY" });
    if (path === "/v1/companies/company-one/references/secret-model-one") return send(200, { reference: {
      id: "secret-model-one", companyId: "company-one", purpose: "MODEL_PROVIDER",
      providerAdapterId: "model-provider-one", currentVersion: 4, status: "ACTIVE",
    } });
    if (path === "/v1/leases" && request.method === "POST") return send(201, { lease: {
      id: "lease-one", secretReferenceId: "secret-model-one", version: 4, consumerId: "model-provider-one",
      workAttemptId: "attempt-one", issuedAt: "2026-08-25T12:00:01.000Z",
      expiresAt: "2026-08-25T12:05:00.000Z", attestationDigest: `sha256:${"d".repeat(64)}`,
    } });
    if (path === "/v1/companies/company-one/leases/lease-one/revocations" && request.method === "POST") {
      return send(202, { revoked: true });
    }
    if (path === "/v1/reference-management-sessions" && request.method === "POST") return send(201, { session: {
      id: "management-session", companyId: "company-one", referenceId: "new-model-key", operation: "CREATE",
      managementUrl: `http://127.0.0.1:${(broker.address() as import("node:net").AddressInfo).port}/manage/opaque`,
      expiresAt: "2026-08-25T12:10:00.000Z",
    } });
    if (path === "/v1/companies/company-one/reference-management-sessions/management-session") {
      return send(200, { result: { status: "COMPLETED", reference: {
        id: "new-model-key", companyId: "company-one", purpose: "MODEL_PROVIDER",
        providerAdapterId: "model-provider-one", currentVersion: 1, status: "ACTIVE",
      } } });
    }
    return send(404, { error: { code: "SECRET_REFERENCE_NOT_FOUND", retryable: false } });
  });
  broker.listen(0, "127.0.0.1");
  await once(broker, "listening");
  const address = broker.address();
  assert.ok(address && typeof address !== "string");
  const options = { brokerId: "http-secret-broker", displayName: "Enterprise Secret Broker",
    baseUrl: `http://127.0.0.1:${address.port}`, bearerToken: "synthetic-broker-token",
    allowInsecureLoopback: true, requestTimeoutMs: 2_000, maximumLeaseSeconds: 600 };
  try {
    const port = createSecretBrokerRuntimePort(options);
    assert.equal(await port.health(), "HEALTHY");
    const events = new InMemoryEventStore();
    const identity = { async getCurrentIdentity() { return { actorId: "human-one", organizationId: "company-one",
      displayName: "Human One", assurance: "ENTERPRISE_ASSERTED" as const }; }, async currentPrincipal() { return null; },
      async authorize() { return { id: "authorization-one", principalId: "human-one",
        authorizedAt: "2026-08-25T12:00:00.000Z" }; } };
    let eventIds = 0;
    const grant = await new IssueSecretLease({ identity, broker: port, events,
      now: () => "2026-08-25T12:00:00.000Z", nextId: () => `secret-event-${++eventIds}` }).execute({
      companyId: "company-one", secretReferenceId: "secret-model-one", expectedVersion: 4,
      consumerId: "model-provider-one", workAttemptId: "attempt-one", reasonCode: "MODEL_INFERENCE",
      expiresAt: "2026-08-25T12:05:00.000Z",
    });
    assert.equal(grant.id, "lease-one");
    const reconstructed = createSecretBrokerRuntimePort(options);
    await reconstructed.revokeLease("company-one", "lease-one", "WORK_ATTEMPT_TERMINATED");
    const managementSession = await reconstructed.beginReferenceManagement({ companyId: "company-one",
      referenceId: "new-model-key", operation: "CREATE", purpose: "MODEL_PROVIDER",
      providerAdapterId: "model-provider-one", expectedVersion: null }, "authorization-two");
    assert.equal(managementSession.id, "management-session");
    assert.equal((await reconstructed.referenceManagementResult("company-one", managementSession.id)).status, "COMPLETED");
    assert.deepEqual((await events.read("company-one")).map(({ type }) => type), [
      "secret.access-authorized", "secret.lease-issued",
    ]);
    assert.ok(requests.every(({ authorization }) => authorization === "Bearer synthetic-broker-token"));
    const payloads = JSON.stringify(requests.map(({ body }) => body));
    assert.equal(payloads.includes("synthetic-broker-token"), false);
    assert.doesNotMatch(payloads, /secretValue|credentialValue|privateKey|accessToken|externalSession/i);
    assert.ok(requests.some(({ path }) => path === "/v1/reference-management-sessions"));

    const keys = ["COMPANY_OS_HTTP_SECRET_BROKER_ID", "COMPANY_OS_HTTP_SECRET_BROKER_NAME",
      "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL", "COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN",
      "COMPANY_OS_HTTP_SECRET_BROKER_ALLOW_INSECURE_LOOPBACK", "COMPANY_OS_HTTP_SECRET_BROKER_TIMEOUT_MS",
      "COMPANY_OS_HTTP_SECRET_BROKER_MAXIMUM_LEASE_SECONDS"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_ID = options.brokerId;
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_NAME = options.displayName;
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL = options.baseUrl;
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_BEARER_TOKEN = options.bearerToken;
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_ALLOW_INSECURE_LOOPBACK = "true";
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_TIMEOUT_MS = "2000";
      process.env.COMPANY_OS_HTTP_SECRET_BROKER_MAXIMUM_LEASE_SECONDS = "600";
      const installed = await loadFormalSecretBroker("@company-os/http-secret-broker");
      assert.equal((await installed?.capabilities()).brokerId, "http-secret-broker");
      assert.equal(await installed?.health(), "HEALTHY");
    } finally {
      for (const key of keys) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
    }
  } finally {
    broker.close();
    await once(broker, "close");
  }
});

test("HTTP Secret Broker configuration rejects unsafe transport and credential placement", () => {
  const base = { brokerId: "broker-one", displayName: "Broker", bearerToken: "token",
    allowInsecureLoopback: false, requestTimeoutMs: 1_000, maximumLeaseSeconds: 600 };
  assert.throws(() => validateHttpSecretBrokerConfiguration({ ...base, baseUrl: "http://vault.example" }),
    /HTTP_SECRET_BROKER_TLS_REQUIRED/);
  assert.throws(() => validateHttpSecretBrokerConfiguration({ ...base,
    baseUrl: "https://user:password@vault.example" }), /HTTP_SECRET_BROKER_URL_CREDENTIALS_FORBIDDEN/);
  assert.throws(() => validateHttpSecretBrokerConfiguration({ ...base, baseUrl: "https://vault.example",
    bearerToken: "" }), /HTTP_SECRET_BROKER_BEARER_TOKEN_REQUIRED/);
});
