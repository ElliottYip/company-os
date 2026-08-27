import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "node:https";

import { parseDependencySecretMetadata } from "../adapters/config/site-runtime-contract.ts";
import { createVaultBootstrapSecretSink, createVaultHttpsTransport } from
  "../scripts/bootstrap-reference-vault.ts";
import { startReferenceOidcServer } from "./support/reference-oidc-server.ts";

test("Vault bootstrap sink writes exclusive recovery/AppRole files then removes the initial root token", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-vault-bootstrap-sink-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const directory = join(temporary, "secrets"); await mkdir(directory, { mode: 0o700 });
  const purposes = ["POSTGRES_BOOTSTRAP", "OIDC_BOOTSTRAP", "OIDC_CLIENT", "VAULT_INITIALIZATION",
    "VAULT_APPROLE_ROLE_ID", "VAULT_APPROLE_SECRET_ID", "BROKER_CONTROL_TOKEN",
    "BROKER_EXECUTION_TOKEN", "BROKER_SIGNING_KEY", "AGENT_NODE_TOKEN", "AGENT_PROVIDER",
    "INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY"];
  const metadata = parseDependencySecretMetadata({ schemaVersion: 1, siteId: "company-os-test-site",
    directory, entries: purposes.map((purpose, index) => ({ purpose, filename: `secret-${index}`,
      ownerReference: "team:test", consumer: `dependency:${index}`,
      generationMethod: purpose === "AGENT_PROVIDER" ? "VAULT_RENDERED" :
        purpose.startsWith("VAULT_APPROLE_") || purpose === "VAULT_INITIALIZATION" ?
          "BOOTSTRAP_OUTPUT" : "GENERATED_ON_TARGET",
      rotationClass: purpose.includes("TLS") ? "CERTIFICATE_LIFECYCLE" : "ROTATABLE",
      mode: purpose === "INTERNAL_TLS_CERT" ? 0o600 : 0o400 })) }, "company-os-test-site");
  const sink = createVaultBootstrapSecretSink(metadata);
  await sink.writeInitialization({ schemaVersion: 1, seal: "SHAMIR", secretShares: 1,
    secretThreshold: 1, unsealKeyBase64: "synthetic-unseal-key-material",
    initialRootToken: "synthetic-root-token-material" });
  await sink.writeAppRole({ roleId: "synthetic-role-id-material", secretId: "synthetic-secret-id-material" });
  await sink.finalizeInitialization({ schemaVersion: 1, seal: "SHAMIR", secretShares: 1,
    secretThreshold: 1, unsealKeyBase64: "synthetic-unseal-key-material", initialRootTokenRevoked: true });
  const byPurpose = new Map(metadata.entries.map((entry) => [entry.purpose, entry]));
  const recoveryPath = join(directory, byPurpose.get("VAULT_INITIALIZATION")!.filename);
  const recovery = await readFile(recoveryPath, "utf8");
  assert.match(recovery, /initialRootTokenRevoked/); assert.doesNotMatch(recovery, /root-token-material/);
  assert.equal((await stat(recoveryPath)).mode & 0o777, byPurpose.get("VAULT_INITIALIZATION")!.mode);
  assert.equal((await readFile(join(directory, byPurpose.get("VAULT_APPROLE_ROLE_ID")!.filename), "utf8")).trim(),
    "synthetic-role-id-material");
  await assert.rejects(sink.writeInitialization({ schemaVersion: 1, seal: "SHAMIR", secretShares: 1,
    secretThreshold: 1, unsealKeyBase64: "another-unseal-key", initialRootToken: "another-root-token" }),
  /VAULT_BOOTSTRAP_OUTPUT_EXISTS_REVIEW_REQUIRED/);
});

test("Vault HTTPS transport validates the supplied CA and bounded JSON response", async (context) => {
  const certificate = await startReferenceOidcServer({ sub: "vault-test", name: "Vault Test",
    email: "vault@example.test" });
  const requests: { path: string; token?: string }[] = [];
  const server = createServer({ key: certificate.tlsKey, cert: certificate.tlsCertificate },
    (request, response) => {
      requests.push({ path: request.url ?? "", ...(typeof request.headers["x-vault-token"] === "string" ?
        { token: request.headers["x-vault-token"] } : {}) });
      const body = JSON.stringify({ initialized: false });
      response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
      response.end(body);
    });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
  });
  context.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve())); await certificate.close();
  });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `https://127.0.0.1:${address.port}`;
  const transport = createVaultHttpsTransport(origin, certificate.tlsCertificate);
  const status = await transport.request({ method: "GET", path: "/v1/sys/init", token: "synthetic-token" });
  assert.deepEqual(status, { initialized: false });
  assert.deepEqual(requests, [{ path: "/v1/sys/init", token: "synthetic-token" }]);
  await assert.rejects(transport.request({ method: "GET", path: "/v1/../sys/init" }),
    /VAULT_BOOTSTRAP_REQUEST_PATH_INVALID/);
  await assert.rejects(transport.request({ method: "GET", path: "/v1/%2e%2e/sys/init" }),
    /VAULT_BOOTSTRAP_REQUEST_PATH_INVALID/);
  assert.throws(() => createVaultHttpsTransport(origin.replace("https:", "http:"),
    certificate.tlsCertificate), /VAULT_BOOTSTRAP_ORIGIN_INVALID/);
});
