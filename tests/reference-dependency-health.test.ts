import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyReferenceDependencyHealth } from "../scripts/verify-reference-dependency-health.ts";
import { startReferenceOidcServer } from "./support/reference-oidc-server.ts";

test("reference dependency health verifies every service over the supplied TLS authority", async (context) => {
  const certificate = await startReferenceOidcServer({ sub: "health-test", name: "Health Test",
    email: "health@example.test" });
  const temporary = await mkdtemp(join(tmpdir(), "company-os-dependency-health-"));
  const caPath = join(temporary, "ca.pem"); await writeFile(caPath, certificate.tlsCertificate, { mode: 0o600 });
  const brokerTokenFile = join(temporary, "broker-token"); const agentTokenFile = join(temporary, "agent-token");
  await writeFile(brokerTokenFile, "synthetic-broker-token-material\n", { mode: 0o400 });
  await writeFile(agentTokenFile, "synthetic-agent-token-material\n", { mode: 0o400 });
  const authenticated: string[] = [];
  const server = createServer({ key: certificate.tlsKey, cert: certificate.tlsCertificate },
    (request, response) => {
      if (request.url === "/v1/health") authenticated.push(request.headers.authorization ?? "");
      const bodies: Record<string, unknown> = {
        "/.well-known/openid-configuration": { issuer: "https://127.0.0.1" },
        "/v1/sys/health": { initialized: true, sealed: false },
        "/v1/health": { status: "HEALTHY" },
      };
      const body = JSON.stringify(bodies[request.url ?? ""] ?? { error: "not_found" });
      response.writeHead(bodies[request.url ?? ""] ? 200 : 404,
        { "content-type": "application/json", "content-length": Buffer.byteLength(body) }); response.end(body);
    });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
  });
  context.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve())); await certificate.close();
    await rm(temporary, { recursive: true, force: true });
  });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `https://127.0.0.1:${address.port}`;
  const result = await verifyReferenceDependencyHealth({ certificateAuthorityFile: caPath,
    oidcDiscoveryUrl: `${base}/.well-known/openid-configuration`, vaultOrigin: base,
    brokerOrigin: base, agentOrigin: base, brokerTokenFile, agentTokenFile }, { attempts: 1 });
  assert.deepEqual(result, { schemaVersion: 1, status: "REFERENCE_DEPENDENCIES_HEALTHY",
    tlsVerified: true, services: ["OIDC", "VAULT", "BROKER", "AGENT"] });
  assert.deepEqual(authenticated, ["Bearer synthetic-broker-token-material",
    "Bearer synthetic-agent-token-material"]);
});

test("reference dependency health fails closed without reflecting endpoint content", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "company-os-dependency-health-invalid-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const caPath = join(temporary, "ca.pem"); await writeFile(caPath, "x".repeat(80), { mode: 0o600 });
  const tokenPath = join(temporary, "token"); await writeFile(tokenPath, "synthetic-token-material\n", { mode: 0o400 });
  await assert.rejects(verifyReferenceDependencyHealth({ certificateAuthorityFile: caPath,
    oidcDiscoveryUrl: "https://identity.example.test/.well-known/openid-configuration",
    vaultOrigin: "https://vault.example.test", brokerOrigin: "https://broker.example.test",
    agentOrigin: "https://agent.example.test", brokerTokenFile: tokenPath, agentTokenFile: tokenPath },
  { attempts: 1 }),
  /REFERENCE_DEPENDENCY_OIDC_HEALTH_FAILED/);
  await chmod(caPath, 0o644);
  await assert.rejects(verifyReferenceDependencyHealth({ certificateAuthorityFile: caPath,
    oidcDiscoveryUrl: "https://identity.example.test/.well-known/openid-configuration",
    vaultOrigin: "https://vault.example.test", brokerOrigin: "https://broker.example.test",
    agentOrigin: "https://agent.example.test", brokerTokenFile: tokenPath, agentTokenFile: tokenPath },
  { attempts: 1 }),
  /REFERENCE_DEPENDENCY_CA_FILE_UNSAFE/);
});
