import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertIndependentSites,
  parseDependencySecretMetadata,
  parseSiteRuntimeManifest,
  renderSitePublicEnvironment,
} from "../adapters/config/site-runtime-contract.ts";

const digest = (name: string, character = "a") =>
  `ghcr.io/elliottyip/company-os-${name}@sha256:${character.repeat(64)}`;

function site(overrides: Record<string, unknown> = {}) {
  const value = {
    schemaVersion: 1,
    environment: "STAGING",
    site: {
      id: "company-os-hong-kong",
      role: "ACTIVE",
      region: "hong-kong",
      deploymentRoot: "/srv/company-os/staging",
      composeProject: "company-os-hong-kong",
      productNetwork: "company-os-hong-kong-product",
      dependencyNetwork: "company-os-hong-kong-dependencies",
      ports: { referenceDataNode: 4322, web: 4600, api: 4601 },
      resourceBudget: {
        hostMemoryBytes: 7_441_052_672,
        minimumAvailableMemoryBytes: 2_147_483_648,
        maximumDeclaredMemoryBytes: 3_221_225_472,
        requiredHeadroomBytes: 536_870_912,
        maximumCpu: 3.05,
        maximumPids: 800,
      },
    },
    product: {
      releaseId: `0.1.0-rc.5-${"b".repeat(12)}`,
      exposure: "PUBLIC",
      webOrigin: "https://company-os.raft.xin",
      apiOrigin: "https://company-os-api.raft.xin",
      oidcRedirectUri: "https://company-os-api.raft.xin/api/auth/oauth2/callback/enterprise-oidc",
      instanceId: "company-os-hong-kong",
      connectorIds: { agentNode: "codex-hong-kong", dataNode: "fixtures-hong-kong",
        secretBroker: "vault-hong-kong" },
      images: {
        api: digest("api", "1"), web: digest("web", "2"), ops: digest("ops", "3"),
        codexAgentNode: digest("codex-agent-node", "4"),
        vaultSecretBroker: digest("vault-secret-broker", "5"),
        referenceDataNode: digest("reference-data-node", "6"),
      },
    },
    dependencies: {
      postgres: { image: `postgres@sha256:${"7".repeat(64)}`, majorVersion: 16,
        volume: "company-os-hong-kong-postgres", tlsServerName: "postgres.hk.internal",
        ownerReference: "team:database", evidenceReference: "evidence:postgres-hk" },
      oidc: { image: `ghcr.io/dexidp/dex@sha256:${"8".repeat(64)}`,
        issuer: "https://identity.hk.internal",
        discoveryUrl: "https://identity.hk.internal/.well-known/openid-configuration",
        clientId: "company-os-hong-kong", callbackUri:
          "https://company-os-api.raft.xin/api/auth/oauth2/callback/enterprise-oidc",
        volume: "company-os-hong-kong-oidc", ownerReference: "team:identity",
        evidenceReference: "evidence:oidc-hk" },
      vault: { image: `hashicorp/vault@sha256:${"9".repeat(64)}`,
        baseUrl: "https://vault.hk.internal", volume: "company-os-hong-kong-vault",
        ownerReference: "team:secrets", evidenceReference: "evidence:vault-hk" },
      secretBroker: { image: digest("vault-secret-broker", "5"), id: "vault-hong-kong",
        baseUrl: "https://broker.hk.internal", ownerReference: "team:secrets",
        evidenceReference: "evidence:broker-hk" },
      agentNode: { image: digest("codex-agent-node", "4"), id: "codex-hong-kong",
        baseUrl: "https://agent.hk.internal", ownerReference: "team:agent-runtime",
        evidenceReference: "evidence:agent-hk" },
      referenceDataNode: { image: digest("reference-data-node", "6"), id: "fixtures-hong-kong",
        baseUrl: "https://data.hk.internal", volume: "company-os-hong-kong-data-node",
        ownerReference: "team:data-runtime", evidenceReference: "evidence:data-hk",
        fixtureOnly: true },
      provider: { registrationId: "provider-hong-kong", executionOwner: "AGENT_NODE",
        ownerReference: "team:model-runtime", evidenceReference: "evidence:provider-hk" },
    },
    capabilities: {
      publicIngress: "ENABLED",
      offSiteBackup: "DISABLED_PENDING_AUTHORIZATION",
      modelInference: "EXTERNAL",
      enterpriseData: "EXTERNAL",
    },
    authorization: {
      dependencyInitialization: null,
      migrationProvision: null,
      productStart: null,
      acceptance: null,
    },
  };
  return Object.assign(value, overrides);
}

function hangzhouSite() {
  const value = structuredClone(site());
  value.site.id = "company-os-hangzhou-7";
  value.site.role = "STANDBY";
  value.site.region = "hangzhou-7";
  value.site.deploymentRoot = "/data/company-os/staging";
  value.site.composeProject = "company-os-hangzhou-7";
  value.site.productNetwork = "company-os-hangzhou-7-product";
  value.site.dependencyNetwork = "company-os-hangzhou-7-dependencies";
  value.product.exposure = "PRIVATE";
  value.product.webOrigin = "https://web.company-os.hangzhou-7.internal";
  value.product.apiOrigin = "https://api.company-os.hangzhou-7.internal";
  value.product.oidcRedirectUri =
    "https://api.company-os.hangzhou-7.internal/api/auth/oauth2/callback/enterprise-oidc";
  value.product.instanceId = "company-os-hangzhou-7";
  value.product.connectorIds = { agentNode: "codex-hangzhou-7", dataNode: "fixtures-hangzhou-7",
    secretBroker: "vault-hangzhou-7" };
  value.dependencies.postgres.volume = "company-os-hangzhou-7-postgres";
  value.dependencies.postgres.tlsServerName = "postgres.hangzhou-7.internal";
  value.dependencies.oidc.issuer = "https://identity.hangzhou-7.internal";
  value.dependencies.oidc.discoveryUrl =
    "https://identity.hangzhou-7.internal/.well-known/openid-configuration";
  value.dependencies.oidc.clientId = "company-os-hangzhou-7";
  value.dependencies.oidc.callbackUri = value.product.oidcRedirectUri;
  value.dependencies.oidc.volume = "company-os-hangzhou-7-oidc";
  value.dependencies.vault.baseUrl = "https://vault.hangzhou-7.internal";
  value.dependencies.vault.volume = "company-os-hangzhou-7-vault";
  value.dependencies.secretBroker.id = "vault-hangzhou-7";
  value.dependencies.secretBroker.baseUrl = "https://broker.hangzhou-7.internal";
  value.dependencies.agentNode.id = "codex-hangzhou-7";
  value.dependencies.agentNode.baseUrl = "https://agent.hangzhou-7.internal";
  value.dependencies.referenceDataNode.id = "fixtures-hangzhou-7";
  value.dependencies.referenceDataNode.baseUrl = "https://data.hangzhou-7.internal";
  value.dependencies.referenceDataNode.volume = "company-os-hangzhou-7-data-node";
  value.dependencies.provider.registrationId = "provider-hangzhou-7";
  value.capabilities.publicIngress = "DISABLED_PENDING_AUTHORIZATION";
  return value;
}

function dependencySecrets() {
  const purpose = [
    "POSTGRES_BOOTSTRAP", "OIDC_BOOTSTRAP", "OIDC_CLIENT", "VAULT_INITIALIZATION",
    "VAULT_APPROLE", "BROKER_VAULT", "AGENT_PROVIDER", "INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY",
  ] as const;
  return {
    schemaVersion: 1,
    siteId: "company-os-hong-kong",
    directory: "/etc/company-os/dependency-secrets",
    entries: purpose.map((item, index) => ({
      purpose: item,
      filename: `${item.toLowerCase().replaceAll("_", "-")}-${index + 1}`,
      ownerReference: "team:infrastructure",
      consumer: `dependency:${item.toLowerCase()}`,
      generationMethod: item === "BROKER_VAULT" ? "VAULT_RENDERED" : "GENERATED_ON_TARGET",
      rotationClass: item.includes("TLS") ? "CERTIFICATE_LIFECYCLE" : "ROTATABLE",
      mode: item === "INTERNAL_TLS_CERT" ? 0o600 : 0o400,
    })),
  };
}

test("site runtime contract admits independent active and private standby sites", () => {
  const hongKong = parseSiteRuntimeManifest(site());
  const hangzhou = parseSiteRuntimeManifest(hangzhouSite());
  assert.equal(hongKong.site.role, "ACTIVE");
  assert.equal(hangzhou.site.role, "STANDBY");
  assert.equal(hangzhou.capabilities.publicIngress, "DISABLED_PENDING_AUTHORIZATION");
  assert.doesNotMatch(JSON.stringify(hangzhou), /raft\.xin|hong-kong|\.hk\.internal/);
  assert.doesNotThrow(() => assertIndependentSites(hongKong, hangzhou));
});

test("site contract renders complete site-owned public configuration without cross-site coordinates", () => {
  const hongKong = renderSitePublicEnvironment(parseSiteRuntimeManifest(site()),
    "/etc/company-os/hong-kong-secrets");
  const hangzhou = renderSitePublicEnvironment(parseSiteRuntimeManifest(hangzhouSite()),
    "/etc/company-os/hangzhou-7-secrets");

  assert.match(hongKong, /COMPANY_OS_PUBLIC_URL=https:\/\/company-os-api\.raft\.xin/);
  assert.match(hongKong, /COMPANY_OS_COMPOSE_PROJECT=company-os-hong-kong/);
  assert.match(hangzhou, /COMPANY_OS_PUBLIC_URL=https:\/\/api\.company-os\.hangzhou-7\.internal/);
  assert.match(hangzhou, /COMPANY_OS_PUBLIC_INGRESS=DISABLED_PENDING_AUTHORIZATION/);
  assert.match(hangzhou, /COMPANY_OS_OFF_SITE_BACKUP=DISABLED_PENDING_AUTHORIZATION/);
  assert.doesNotMatch(hangzhou, /raft\.xin|hong-kong|\.hk\.internal/);
  assert.doesNotMatch(`${hongKong}\n${hangzhou}`, /CLIENT_SECRET=|BEARER_TOKEN=|PASSWORD=|DATABASE_URL=/);
});

test("staging Compose consumes site variables and keeps opt-in backup out of base interpolation", async () => {
  const source = await readFile(new URL("../deploy/compose.staging.yml", import.meta.url), "utf8");
  assert.doesNotMatch(source, /company-os(?:-api)?\.raft\.xin|company-os-staging-raft-xin/);
  for (const variable of [
    "COMPANY_OS_COMPOSE_PROJECT", "COMPANY_OS_PRODUCT_NETWORK", "COMPANY_OS_PUBLIC_URL",
    "COMPANY_OS_WEB_ORIGINS", "COMPANY_OS_OIDC_REDIRECT_URI", "COMPANY_OS_INSTANCE_ID",
    "COMPANY_OS_REFERENCE_DATA_NODE_PORT", "COMPANY_OS_WEB_LOOPBACK_PORT",
    "COMPANY_OS_API_LOOPBACK_PORT", "COMPANY_OS_DATA_NODE_VOLUME", "COMPANY_OS_BACKUP_VOLUME",
  ]) assert.match(source, new RegExp(`\\$\\{${variable}`));
  assert.doesNotMatch(source, /COMPANY_OS_BACKUP_S3_(?:ENDPOINT|REGION|BUCKET):\?/);
});

test("site runtime contract rejects mutable images, callback drift, unknown keys and inadequate headroom", () => {
  const mutable = site(); mutable.product.images.api = "ghcr.io/elliottyip/company-os-api:latest";
  assert.throws(() => parseSiteRuntimeManifest(mutable), /SITE_RUNTIME_MANIFEST_INVALID/);

  const callbackDrift = site(); callbackDrift.dependencies.oidc.callbackUri = "https://wrong.example/callback";
  assert.throws(() => parseSiteRuntimeManifest(callbackDrift), /SITE_RUNTIME_MANIFEST_INVALID/);

  const unknown = site() as ReturnType<typeof site> & { unexpected?: boolean }; unknown.unexpected = true;
  assert.throws(() => parseSiteRuntimeManifest(unknown), /SITE_RUNTIME_MANIFEST_INVALID/);

  const noHeadroom = site();
  noHeadroom.site.resourceBudget.maximumDeclaredMemoryBytes = 7_100_000_000;
  assert.throws(() => parseSiteRuntimeManifest(noHeadroom), /SITE_RUNTIME_RESOURCE_HEADROOM_INSUFFICIENT/);
});

test("site isolation rejects shared identity, networks, volumes, connectors and dependency coordinates", () => {
  const left = parseSiteRuntimeManifest(site());
  for (const mutate of [
    (value: ReturnType<typeof hangzhouSite>) => { value.dependencies.oidc.clientId = "company-os-hong-kong"; },
    (value: ReturnType<typeof hangzhouSite>) => { value.site.productNetwork = "company-os-hong-kong-product"; },
    (value: ReturnType<typeof hangzhouSite>) => { value.dependencies.postgres.volume = "company-os-hong-kong-postgres"; },
    (value: ReturnType<typeof hangzhouSite>) => {
      value.dependencies.agentNode.id = "codex-hong-kong";
      value.product.connectorIds.agentNode = "codex-hong-kong";
    },
    (value: ReturnType<typeof hangzhouSite>) => { value.dependencies.vault.baseUrl = "https://vault.hk.internal"; },
  ]) {
    const rightValue = hangzhouSite(); mutate(rightValue);
    const right = parseSiteRuntimeManifest(rightValue);
    assert.throws(() => assertIndependentSites(left, right), /SITE_RUNTIME_CROSS_SITE_REUSE/);
  }
});

test("dependency Secret metadata requires every purpose but never accepts a value", () => {
  const parsed = parseDependencySecretMetadata(dependencySecrets(), "company-os-hong-kong");
  assert.equal(parsed.entries.length, 9);
  assert.equal(parsed.entries.every(({ mode }) => mode === 0o400 || mode === 0o600), true);
  assert.doesNotMatch(JSON.stringify(parsed), /secretValue|tokenValue|passwordValue/);

  const missing = dependencySecrets(); missing.entries.pop();
  assert.throws(() => parseDependencySecretMetadata(missing, "company-os-hong-kong"),
    /DEPENDENCY_SECRET_METADATA_INVALID/);

  const withValue = dependencySecrets() as ReturnType<typeof dependencySecrets> &
    { entries: Array<ReturnType<typeof dependencySecrets>["entries"][number] & { value?: string }> };
  withValue.entries[0]!.value = "must-not-be-retained";
  assert.throws(() => parseDependencySecretMetadata(withValue, "company-os-hong-kong"),
    /DEPENDENCY_SECRET_METADATA_INVALID/);
});
