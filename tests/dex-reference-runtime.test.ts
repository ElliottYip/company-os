import assert from "node:assert/strict";
import test from "node:test";

import { parseDexBootstrapSecret, renderDexPrivateConfiguration } from
  "../adapters/config/dex-reference-runtime.ts";
import { parseSiteRuntimeManifest } from "../adapters/config/site-runtime-contract.ts";
import { siteRuntimeFixture } from "./fixtures/site-runtime-fixture.ts";

const image = (name: string, digest: string) =>
  `ghcr.io/example/${name}@sha256:${digest.repeat(64)}`;
const images = { api: image("api", "1"), web: image("web", "2"), ops: image("ops", "3"),
  codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
  referenceDataNode: image("data", "6") };
const manifest = parseSiteRuntimeManifest(siteRuntimeFixture({ root: "/tmp/company-os-dex-test",
  releaseId: `0.1.0-rc.5-${"b".repeat(12)}`, images }).site);

const bcryptFixture = `$2b$12$${"A".repeat(53)}`;
const bootstrap = {
  schemaVersion: 1,
  email: "operator@company-os.test",
  username: "company-os-operator",
  displayName: "Company OS staging operator",
  userId: "company-os-staging-operator",
  passwordHash: bcryptFixture,
};

test("Dex bootstrap accepts one bounded non-production identity with a password hash only", () => {
  assert.deepEqual(parseDexBootstrapSecret(bootstrap), bootstrap);
  const forbiddenMaterial = ["must", "not", "be", "present"].join("-");
  assert.throws(() => parseDexBootstrapSecret({ ...bootstrap, password: forbiddenMaterial }),
    /DEX_BOOTSTRAP_SECRET_INVALID/);
  assert.throws(() => parseDexBootstrapSecret({ ...bootstrap, passwordHash: "plain-text" }),
    /DEX_BOOTSTRAP_SECRET_INVALID/);
});

test("Dex private configuration binds issuer, PKCE, client and durable storage", () => {
  const rendered = renderDexPrivateConfiguration(manifest, parseDexBootstrapSecret(bootstrap),
    "synthetic-client-secret-material-32-bytes");
  const config = JSON.parse(rendered);
  assert.equal(config.issuer, "https://identity.test.internal");
  assert.deepEqual(config.storage, { type: "sqlite3", config: { file: "/var/dex/dex.db" } });
  assert.deepEqual(config.oauth2.pkce, { enforce: true, codeChallengeMethodsSupported: ["S256"] });
  assert.equal(config.staticClients[0].id, "company-os-test-site");
  assert.equal(config.staticClients[0]["secret"], "synthetic-client-secret-material-32-bytes");
  assert.deepEqual(config.staticClients[0].redirectURIs,
    ["https://api.company-os.test.internal/api/auth/oauth2/callback/enterprise-oidc"]);
  assert.deepEqual(config.staticPasswords, [{ email: bootstrap.email, hash: bootstrap.passwordHash,
    username: bootstrap.username, name: bootstrap.displayName, emailVerified: true,
    userID: bootstrap.userId }]);
  assert.equal(config.enablePasswordDB, true);
  assert.doesNotMatch(rendered, /password\"|plain-text|CHANGE_ME/);
});

test("Dex private configuration rejects weak client material and non-Dex manifests", () => {
  assert.throws(() => renderDexPrivateConfiguration(manifest, bootstrap, "too-short"),
    /DEX_CLIENT_SECRET_INVALID/);
  const drift = structuredClone(manifest) as unknown as { dependencies: { oidc: { runtime: string } } };
  drift.dependencies.oidc.runtime = "GENERIC";
  assert.throws(() => renderDexPrivateConfiguration(drift as never, bootstrap,
    "synthetic-client-secret-material-32-bytes"), /DEX_RUNTIME_REQUIRED/);
});
