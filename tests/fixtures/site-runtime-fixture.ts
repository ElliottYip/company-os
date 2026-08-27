import { renderSitePublicEnvironment, parseSiteRuntimeManifest } from
  "../../adapters/config/site-runtime-contract.ts";

export function siteRuntimeFixture(input: {
  root: string;
  releaseId: string;
  images: { api: string; web: string; ops: string; codexAgentNode: string;
    vaultSecretBroker: string; referenceDataNode: string };
  authorization?: { dependencyInitialization: string | null; migrationProvision: string | null;
    productStart: string | null; acceptance: string | null };
}) {
  const site = {
    schemaVersion: 1, environment: "STAGING",
    site: { id: "company-os-test-site", role: "ACTIVE", region: "test-region",
      deploymentRoot: input.root, composeProject: "company-os-test-site",
      productNetwork: "company-os-test-site-product",
      dependencyNetwork: "company-os-test-site-dependencies",
      ports: { referenceDataNode: 4322, web: 4600, api: 4601 },
      resourceBudget: { hostMemoryBytes: 8_000_000_000,
        minimumAvailableMemoryBytes: 2_147_483_648, maximumDeclaredMemoryBytes: 3_200_000_000,
        requiredHeadroomBytes: 536_870_912, maximumCpu: 3.05, maximumPids: 800 } },
    product: { releaseId: input.releaseId, exposure: "PRIVATE",
      webOrigin: "https://web.company-os.test.internal",
      apiOrigin: "https://api.company-os.test.internal",
      oidcRedirectUri:
        "https://api.company-os.test.internal/api/auth/oauth2/callback/enterprise-oidc",
      instanceId: "company-os-test-site",
      connectorIds: { agentNode: "codex-test-site", dataNode: "fixtures-test-site",
        secretBroker: "vault-test-site" }, images: input.images },
    dependencies: {
      postgres: { image: `postgres@sha256:${"7".repeat(64)}`, majorVersion: 16,
        volume: "company-os-test-site-postgres", tlsServerName: "postgres.test.internal",
        ownerReference: "team:database", evidenceReference: "evidence:postgres-test" },
      oidc: { runtime: "DEX", image: `ghcr.io/dexidp/dex@sha256:${"8".repeat(64)}`,
        issuer: "https://identity.test.internal",
        discoveryUrl: "https://identity.test.internal/.well-known/openid-configuration",
        clientId: "company-os-test-site",
        callbackUri:
          "https://api.company-os.test.internal/api/auth/oauth2/callback/enterprise-oidc",
        volume: "company-os-test-site-oidc", ownerReference: "team:identity",
        evidenceReference: "evidence:oidc-test" },
      vault: { image: `hashicorp/vault@sha256:${"9".repeat(64)}`,
        baseUrl: "https://vault.test.internal", volume: "company-os-test-site-vault",
        ownerReference: "team:secrets", evidenceReference: "evidence:vault-test" },
      secretBroker: { image: input.images.vaultSecretBroker, id: "vault-test-site",
        baseUrl: "https://broker.test.internal", ownerReference: "team:secrets",
        evidenceReference: "evidence:broker-test" },
      agentNode: { image: input.images.codexAgentNode, id: "codex-test-site",
        baseUrl: "https://agent.test.internal", ownerReference: "team:agent-runtime",
        evidenceReference: "evidence:agent-test" },
      referenceDataNode: { image: input.images.referenceDataNode, id: "fixtures-test-site",
        baseUrl: "https://data.test.internal", volume: "company-os-test-site-data-node",
        ownerReference: "team:data-runtime", evidenceReference: "evidence:data-test",
        fixtureOnly: true },
      provider: { registrationId: "provider-test-site", executionOwner: "AGENT_NODE",
        ownerReference: "team:model-runtime", evidenceReference: "evidence:provider-test" },
    },
    capabilities: { publicIngress: "DISABLED_PENDING_AUTHORIZATION",
      offSiteBackup: "DISABLED_PENDING_AUTHORIZATION", modelInference: "EXTERNAL",
      enterpriseData: "EXTERNAL" },
    authorization: input.authorization ?? { dependencyInitialization: null, migrationProvision: null,
      productStart: null, acceptance: null },
  };
  const productSecretDirectory = `${input.root}/product-secrets`;
  const dependencySecretMetadata = dependencySecrets();
  const dependencyManifest = {
    schemaVersion: 1, environment: "STAGING", deploymentId: site.site.id,
    ingress: { webOrigin: site.product.webOrigin, apiOrigin: site.product.apiOrigin,
      ownerReference: "team:infrastructure", dnsEvidenceReference: "evidence:dns-test",
      tlsEvidenceReference: "evidence:tls-test" },
    isolation: { deploymentRoot: input.root, composeProject: site.site.composeProject,
      network: site.site.productNetwork, webLoopbackPort: site.site.ports.web,
      apiLoopbackPort: site.site.ports.api },
    postgres: { majorVersion: 16, ownership: "DEDICATED", tlsMode: "VERIFY_FULL",
      coordinateSource: "SECRET_FILES", ownerReference: "team:database",
      evidenceReference: "evidence:postgres-test" },
    oidc: { issuer: site.dependencies.oidc.issuer,
      discoveryUrl: site.dependencies.oidc.discoveryUrl, clientId: site.dependencies.oidc.clientId,
      ownership: "PRODUCT_SCOPED_CLIENT", pkce: "S256", ownerReference: "team:identity",
      evidenceReference: "evidence:oidc-test" },
    vaultBroker: { baseUrl: site.dependencies.secretBroker.baseUrl, ownership: "DEDICATED",
      ownerReference: "team:secrets", evidenceReference: "evidence:broker-test" },
    agentNode: { baseUrl: site.dependencies.agentNode.baseUrl, ownership: "DEDICATED",
      ownerReference: "team:agent", evidenceReference: "evidence:agent-test" },
    dataNode: { baseUrl: site.dependencies.referenceDataNode.baseUrl, ownership: "DEDICATED",
      ownerReference: "team:data", evidenceReference: "evidence:data-test" },
    backup: { provider: "ZOS_S3_COMPATIBLE", endpoint: "https://backup.test.internal",
      region: "test-region", bucket: "company-os-test-site-backup", ownership: "DEDICATED",
      versioning: true, objectLock: "DISABLED", credentialSource: "VAULT_RENDERED_FILES",
      ownerReference: "team:backup", evidenceReference: "evidence:backup-not-accepted" },
  };
  return { site, productSecretDirectory, dependencySecretMetadata, dependencyManifest,
    publicEnvironment: renderSitePublicEnvironment(parseSiteRuntimeManifest(site), productSecretDirectory) };
}

function dependencySecrets() {
  const purposes = ["POSTGRES_BOOTSTRAP", "OIDC_BOOTSTRAP", "OIDC_CLIENT", "VAULT_INITIALIZATION",
    "VAULT_APPROLE_ROLE_ID", "VAULT_APPROLE_SECRET_ID", "BROKER_CONTROL_TOKEN",
    "BROKER_EXECUTION_TOKEN", "BROKER_SIGNING_KEY", "AGENT_NODE_TOKEN", "AGENT_PROVIDER",
    "INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY"];
  return { schemaVersion: 1, siteId: "company-os-test-site",
    directory: "/etc/company-os/dependency-secrets",
    entries: purposes.map((purpose, index) => ({ purpose,
      filename: `${purpose.toLowerCase().replaceAll("_", "-")}-${index + 1}`,
      ownerReference: "team:infrastructure", consumer: `dependency:${purpose.toLowerCase()}`,
      generationMethod: purpose === "AGENT_PROVIDER" ? "VAULT_RENDERED" :
        purpose.startsWith("VAULT_APPROLE_") || purpose === "VAULT_INITIALIZATION" ?
          "BOOTSTRAP_OUTPUT" : "GENERATED_ON_TARGET",
      rotationClass: purpose.includes("TLS") ? "CERTIFICATE_LIFECYCLE" : "ROTATABLE",
      mode: purpose === "INTERNAL_TLS_CERT" ? 0o600 : 0o400 })),
  };
}
