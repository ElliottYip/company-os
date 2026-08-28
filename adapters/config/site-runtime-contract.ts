export interface SiteRuntimeManifest {
  readonly schemaVersion: 1;
  readonly environment: "STAGING";
  readonly site: {
    readonly id: string;
    readonly role: "ACTIVE" | "STANDBY";
    readonly region: string;
    readonly deploymentRoot: string;
    readonly composeProject: string;
    readonly productNetwork: string;
    readonly dependencyNetwork: string;
    readonly ports: { readonly referenceDataNode: number; readonly web: number; readonly api: number };
    readonly resourceBudget: {
      readonly hostMemoryBytes: number;
      readonly minimumAvailableMemoryBytes: number;
      readonly maximumDeclaredMemoryBytes: number;
      readonly requiredHeadroomBytes: number;
      readonly maximumCpu: number;
      readonly maximumPids: number;
    };
  };
  readonly product: {
    readonly releaseId: string;
    readonly exposure: "PUBLIC" | "PRIVATE";
    readonly webOrigin: string;
    readonly apiOrigin: string;
    readonly oidcRedirectUri: string;
    readonly instanceId: string;
    readonly connectorIds: { readonly agentNode: string; readonly dataNode: string; readonly secretBroker: string };
    readonly images: ProductImages;
  };
  readonly dependencies: {
    readonly postgres: ImageOwned & { readonly majorVersion: 16; readonly volume: string;
      readonly tlsServerName: string };
    readonly oidc: ImageOwned & { readonly runtime: "DEX"; readonly issuer: string; readonly discoveryUrl: string;
      readonly clientId: string; readonly callbackUri: string; readonly volume: string };
    readonly vault: ImageOwned & { readonly baseUrl: string; readonly volume: string };
    readonly secretBroker: ImageOwned & { readonly id: string; readonly baseUrl: string };
    readonly agentNode: ImageOwned & { readonly id: string; readonly baseUrl: string };
    readonly referenceDataNode: ImageOwned & { readonly id: string; readonly baseUrl: string;
      readonly volume: string; readonly fixtureOnly: true };
    readonly provider: OwnedEvidence & { readonly registrationId: string; readonly executionOwner: "AGENT_NODE" };
  };
  readonly capabilities: {
    readonly publicIngress: CapabilityState;
    readonly offSiteBackup: CapabilityState;
    readonly modelInference: "EXTERNAL";
    readonly enterpriseData: "EXTERNAL";
  };
  readonly authorization: {
    readonly dependencyInitialization: string | null;
    readonly migrationProvision: string | null;
    readonly productStart: string | null;
    readonly acceptance: string | null;
  };
}

export type SiteFirstStartPhaseId =
  | "VALIDATE_SITE_CONTRACT" | "VALIDATE_DEPENDENCY_SECRET_METADATA"
  | "INITIALIZE_DEPENDENCIES" | "VERIFY_DEPENDENCY_TLS_AND_HEALTH" | "DOCTOR_PRODUCT"
  | "MIGRATE_DATABASE" | "PROVISION_RUNTIME_ROLE" | "START_REFERENCE_DATA_NODE"
  | "START_API" | "START_WEB" | "RUN_ACCEPTANCE";

export type SiteAuthorizationKind = "DEPENDENCY_INITIALIZATION" | "MIGRATION_PROVISION" |
  "PRODUCT_START" | "ACCEPTANCE";

export interface SiteFirstStartPlan {
  readonly schemaVersion: 1;
  readonly siteId: string;
  readonly releaseId: string;
  readonly status: "BLOCKED_AUTHORIZATION" | "READY_TO_APPLY_BY_PHASE";
  readonly missingAuthorizationKinds: readonly SiteAuthorizationKind[];
  readonly phases: readonly {
    readonly id: SiteFirstStartPhaseId;
    readonly mutating: boolean;
    readonly authorizationKind: SiteAuthorizationKind | null;
    readonly authorizationReference: string | null;
  }[];
}

export function planSiteFirstStart(manifest: SiteRuntimeManifest): SiteFirstStartPlan {
  const authorization = manifest.authorization;
  const definitions: readonly [SiteFirstStartPhaseId, boolean, SiteAuthorizationKind | null,
    string | null][] = [
    ["VALIDATE_SITE_CONTRACT", false, null, null],
    ["VALIDATE_DEPENDENCY_SECRET_METADATA", false, null, null],
    ["INITIALIZE_DEPENDENCIES", true, "DEPENDENCY_INITIALIZATION", authorization.dependencyInitialization],
    ["VERIFY_DEPENDENCY_TLS_AND_HEALTH", false, null, null],
    ["DOCTOR_PRODUCT", false, null, null],
    ["MIGRATE_DATABASE", true, "MIGRATION_PROVISION", authorization.migrationProvision],
    ["PROVISION_RUNTIME_ROLE", true, "MIGRATION_PROVISION", authorization.migrationProvision],
    ["START_REFERENCE_DATA_NODE", true, "PRODUCT_START", authorization.productStart],
    ["START_API", true, "PRODUCT_START", authorization.productStart],
    ["START_WEB", true, "PRODUCT_START", authorization.productStart],
    ["RUN_ACCEPTANCE", true, "ACCEPTANCE", authorization.acceptance],
  ];
  const phases = definitions.map(([id, mutating, authorizationKind, authorizationReference]) =>
    ({ id, mutating, authorizationKind, authorizationReference }));
  const missingAuthorizationKinds = [...new Set(phases
    .filter(({ mutating, authorizationReference }) => mutating && authorizationReference === null)
    .map(({ authorizationKind }) => authorizationKind as SiteAuthorizationKind))];
  return { schemaVersion: 1, siteId: manifest.site.id, releaseId: manifest.product.releaseId,
    status: missingAuthorizationKinds.length ? "BLOCKED_AUTHORIZATION" : "READY_TO_APPLY_BY_PHASE",
    missingAuthorizationKinds, phases };
}

interface ProductImages {
  readonly api: string;
  readonly web: string;
  readonly ops: string;
  readonly codexAgentNode: string;
  readonly vaultSecretBroker: string;
  readonly referenceDataNode: string;
}

interface OwnedEvidence {
  readonly ownerReference: string;
  readonly evidenceReference: string;
}

interface ImageOwned extends OwnedEvidence {
  readonly image: string;
}

type CapabilityState = "ENABLED" | "DISABLED_PENDING_AUTHORIZATION";

export interface DependencySecretMetadata {
  readonly schemaVersion: 1;
  readonly siteId: string;
  readonly directory: string;
  readonly entries: readonly DependencySecretEntry[];
}

export interface DependencySecretEntry {
  readonly purpose: DependencySecretPurpose;
  readonly filename: string;
  readonly ownerReference: string;
  readonly consumer: string;
  readonly generationMethod: "GENERATED_ON_TARGET" | "BOOTSTRAP_OUTPUT" | "VAULT_RENDERED";
  readonly rotationClass: "ROTATABLE" | "CERTIFICATE_LIFECYCLE" | "RECOVERY_CONTROLLED";
  readonly mode: 256 | 384;
}

export type DependencySecretPurpose = typeof DEPENDENCY_SECRET_PURPOSES[number];

export type DependencySecretProjectionConsumer =
  | "POSTGRES" | "VAULT" | "VAULT_SECRET_BROKER" | "CODEX_AGENT_NODE" | "TLS_GATEWAY"
  | "DEPENDENCY_VERIFIER";

export interface DependencySecretProjectionPlan {
  readonly schemaVersion: 1;
  readonly siteId: string;
  readonly status: "PLANNED_NOT_APPLIED";
  readonly sourceDirectory: string;
  readonly bootstrapInputs: readonly {
    readonly purpose: DependencySecretPurpose;
    readonly sourcePath: string;
    readonly consumedBy: "OIDC_PRIVATE_CONFIG" | "VAULT_BOOTSTRAP";
  }[];
  readonly projections: readonly {
    readonly consumer: DependencySecretProjectionConsumer;
    readonly image: string;
    readonly runtimeOwnerResolution: "OCI_IMAGE_DECLARED_USER" | "OCI_IMAGE_EXPLICIT_ACCOUNT";
    readonly runtimeUser: string | null;
    readonly directory: string;
    readonly files: readonly {
      readonly purpose: DependencySecretPurpose;
      readonly sourcePath: string;
      readonly targetPath: string;
      readonly mode: 256 | 384;
    }[];
  }[];
}

const DEPENDENCY_SECRET_PURPOSES = [
  "POSTGRES_BOOTSTRAP", "OIDC_BOOTSTRAP", "OIDC_CLIENT", "VAULT_INITIALIZATION",
  "VAULT_APPROLE_ROLE_ID", "VAULT_APPROLE_SECRET_ID", "BROKER_CONTROL_TOKEN",
  "BROKER_EXECUTION_TOKEN", "BROKER_SIGNING_KEY", "AGENT_NODE_TOKEN", "AGENT_PROVIDER",
  "INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY",
] as const;
const CADDY_IMAGE =
  "caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648";
const IMMUTABLE_IMAGE =
  /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?@sha256:[a-f0-9]{64}$/;
const RELEASE_ID = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{12}$/;
const PORTABLE_NAME = /^[a-z0-9][a-z0-9-]{2,95}$/;
const NETWORK_NAME = /^[a-z0-9][a-z0-9_-]{2,95}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const FILENAME = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const TLS_SERVER_NAME = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/;
const REDACTED_MATERIAL = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:hvs\.|sk-)[A-Za-z0-9_-]{16,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /CHANGE_ME|REPLACE_WITH/i,
];

export function parseSiteRuntimeManifest(value: unknown): SiteRuntimeManifest {
  try {
    const root = exactRecord(value, ["schemaVersion", "environment", "site", "product", "dependencies",
      "capabilities", "authorization"]);
    if (root.schemaVersion !== 1 || root.environment !== "STAGING") invalidSite();
    const site = parseSite(root.site);
    const product = parseProduct(root.product);
    const dependencies = parseDependencies(root.dependencies);
    const capabilities = parseCapabilities(root.capabilities);
    const authorization = parseAuthorization(root.authorization);

    if (product.connectorIds.agentNode !== dependencies.agentNode.id ||
        product.connectorIds.dataNode !== dependencies.referenceDataNode.id ||
        product.connectorIds.secretBroker !== dependencies.secretBroker.id ||
        product.images.codexAgentNode !== dependencies.agentNode.image ||
        product.images.vaultSecretBroker !== dependencies.secretBroker.image ||
        product.images.referenceDataNode !== dependencies.referenceDataNode.image ||
        product.oidcRedirectUri !== dependencies.oidc.callbackUri ||
        new URL(product.oidcRedirectUri).origin !== product.apiOrigin ||
        (product.exposure === "PUBLIC") !== (capabilities.publicIngress === "ENABLED")) invalidSite();

    const result = { schemaVersion: 1, environment: "STAGING", site, product, dependencies,
      capabilities, authorization } satisfies SiteRuntimeManifest;
    rejectMaterial(result, invalidSite);
    return result;
  } catch (error) {
    if (error instanceof Error && (error.message === "SITE_RUNTIME_RESOURCE_HEADROOM_INSUFFICIENT" ||
        error.message === "SITE_RUNTIME_MANIFEST_INVALID")) throw error;
    invalidSite();
  }
}

export function assertIndependentSites(left: SiteRuntimeManifest, right: SiteRuntimeManifest): void {
  const leftOwned = ownedCoordinates(left);
  const rightOwned = new Set(ownedCoordinates(right));
  if (left.site.id === right.site.id || left.site.role === right.site.role ||
      leftOwned.some((value) => rightOwned.has(value))) {
    throw new Error("SITE_RUNTIME_CROSS_SITE_REUSE");
  }
}

export function renderSitePublicEnvironment(
  manifest: SiteRuntimeManifest,
  secretDirectory: string,
): string {
  if (!safeAbsolutePath(secretDirectory) || secretDirectory === "/") invalidSite();
  const values: Readonly<Record<string, string>> = {
    COMPANY_OS_API_IMAGE: manifest.product.images.api,
    COMPANY_OS_RELEASE_ID: manifest.product.releaseId,
    COMPANY_OS_WEB_IMAGE: manifest.product.images.web,
    COMPANY_OS_OPS_IMAGE: manifest.product.images.ops,
    COMPANY_OS_CODEX_AGENT_NODE_IMAGE: manifest.product.images.codexAgentNode,
    COMPANY_OS_VAULT_SECRET_BROKER_IMAGE: manifest.product.images.vaultSecretBroker,
    COMPANY_OS_REFERENCE_DATA_NODE_IMAGE: manifest.product.images.referenceDataNode,
    COMPANY_OS_COMPOSE_PROJECT: manifest.site.composeProject,
    COMPANY_OS_PRODUCT_NETWORK: manifest.site.productNetwork,
    COMPANY_OS_REFERENCE_DATA_NODE_PORT: String(manifest.site.ports.referenceDataNode),
    COMPANY_OS_WEB_LOOPBACK_PORT: String(manifest.site.ports.web),
    COMPANY_OS_API_LOOPBACK_PORT: String(manifest.site.ports.api),
    COMPANY_OS_DATA_NODE_VOLUME: `${manifest.site.id}-data-node`,
    COMPANY_OS_BACKUP_VOLUME: `${manifest.site.id}-backups`,
    COMPANY_OS_PUBLIC_URL: manifest.product.apiOrigin,
    COMPANY_OS_WEB_ORIGINS: manifest.product.webOrigin,
    COMPANY_OS_OIDC_REDIRECT_URI: manifest.product.oidcRedirectUri,
    COMPANY_OS_INSTANCE_ID: manifest.product.instanceId,
    COMPANY_OS_OIDC_ISSUER: manifest.dependencies.oidc.issuer,
    COMPANY_OS_OIDC_DISCOVERY_URL: manifest.dependencies.oidc.discoveryUrl,
    COMPANY_OS_OIDC_CLIENT_ID: manifest.dependencies.oidc.clientId,
    COMPANY_OS_HTTP_AGENT_NODE_ID: manifest.dependencies.agentNode.id,
    COMPANY_OS_HTTP_AGENT_NODE_NAME: `Agent Node ${manifest.site.id}`,
    COMPANY_OS_HTTP_AGENT_NODE_BASE_URL: manifest.dependencies.agentNode.baseUrl,
    COMPANY_OS_HTTP_DATA_NODE_ID: manifest.dependencies.referenceDataNode.id,
    COMPANY_OS_HTTP_DATA_NODE_NAME: `Fixture Data Node ${manifest.site.id}`,
    COMPANY_OS_HTTP_DATA_NODE_BASE_URL: manifest.dependencies.referenceDataNode.baseUrl,
    COMPANY_OS_HTTP_DATA_NODE_SOURCES: "acceptance-fixtures",
    COMPANY_OS_HTTP_DATA_NODE_OPERATIONS: "READ",
    COMPANY_OS_HTTP_SECRET_BROKER_ID: manifest.dependencies.secretBroker.id,
    COMPANY_OS_HTTP_SECRET_BROKER_NAME: `Secret Broker ${manifest.site.id}`,
    COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: manifest.dependencies.secretBroker.baseUrl,
    COMPANY_OS_PUBLIC_INGRESS: manifest.capabilities.publicIngress,
    COMPANY_OS_OFF_SITE_BACKUP: manifest.capabilities.offSiteBackup,
    COMPANY_OS_SECRET_DIRECTORY: secretDirectory,
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

export function renderReferenceDependencyEnvironment(
  manifest: SiteRuntimeManifest,
  metadata: DependencySecretMetadata,
  publicConfigDirectory: string,
  privateConfigDirectory: string,
  secretProjectionRootDirectory = `${manifest.site.deploymentRoot}/dependency-secret-projections`,
): string {
  if (metadata.siteId !== manifest.site.id || !safeAbsolutePath(publicConfigDirectory) ||
      !safeAbsolutePath(privateConfigDirectory) || publicConfigDirectory === privateConfigDirectory ||
      !safeAbsolutePath(secretProjectionRootDirectory) || publicConfigDirectory === "/" ||
      privateConfigDirectory === "/" || secretProjectionRootDirectory === "/") invalidSite();
  const filenames = new Map(metadata.entries.map(({ purpose, filename }) => [purpose, filename]));
  const file = (purpose: DependencySecretPurpose) => {
    const value = filenames.get(purpose);
    if (!value) invalidSite();
    return value;
  };
  if (!portableName(manifest.site.dependencyNetwork)) invalidSite();
  const values: Readonly<Record<string, string>> = {
    COMPANY_OS_SITE_ID: manifest.site.id,
    COMPANY_OS_OPS_IMAGE: manifest.product.images.ops,
    COMPANY_OS_DEPENDENCY_COMPOSE_PROJECT: manifest.site.dependencyNetwork,
    COMPANY_OS_DEPENDENCY_NETWORK: manifest.site.dependencyNetwork,
    COMPANY_OS_PRODUCT_NETWORK: manifest.site.productNetwork,
    COMPANY_OS_DEPENDENCY_SECRET_DIRECTORY: metadata.directory,
    COMPANY_OS_DEPENDENCY_SECRET_METADATA_FILE:
      `${manifest.site.deploymentRoot}/site-contracts/${manifest.site.id}/${manifest.product.releaseId}/dependency-secrets.json`,
    COMPANY_OS_POSTGRES_SECRET_PROJECTION_DIRECTORY:
      `${secretProjectionRootDirectory}/postgres`,
    COMPANY_OS_VAULT_SECRET_PROJECTION_DIRECTORY:
      `${secretProjectionRootDirectory}/vault`,
    COMPANY_OS_BROKER_SECRET_PROJECTION_DIRECTORY:
      `${secretProjectionRootDirectory}/vault-secret-broker`,
    COMPANY_OS_AGENT_SECRET_PROJECTION_DIRECTORY:
      `${secretProjectionRootDirectory}/codex-agent-node`,
    COMPANY_OS_TLS_GATEWAY_SECRET_PROJECTION_DIRECTORY:
      `${secretProjectionRootDirectory}/tls-gateway`,
    COMPANY_OS_VERIFIER_SECRET_PROJECTION_DIRECTORY:
      `${secretProjectionRootDirectory}/dependency-verifier`,
    COMPANY_OS_DEPENDENCY_PUBLIC_CONFIG_DIRECTORY: publicConfigDirectory,
    COMPANY_OS_DEPENDENCY_PRIVATE_CONFIG_DIRECTORY: privateConfigDirectory,
    COMPANY_OS_OIDC_IMAGE: manifest.dependencies.oidc.image,
    COMPANY_OS_OIDC_RUNTIME: manifest.dependencies.oidc.runtime,
    COMPANY_OS_VAULT_IMAGE: manifest.dependencies.vault.image,
    COMPANY_OS_VAULT_SECRET_BROKER_IMAGE: manifest.dependencies.secretBroker.image,
    COMPANY_OS_CODEX_AGENT_NODE_IMAGE: manifest.dependencies.agentNode.image,
    COMPANY_OS_POSTGRES_VOLUME: manifest.dependencies.postgres.volume,
    COMPANY_OS_OIDC_VOLUME: manifest.dependencies.oidc.volume,
    COMPANY_OS_VAULT_VOLUME: manifest.dependencies.vault.volume,
    COMPANY_OS_BROKER_VOLUME: `${manifest.site.id}-broker`,
    COMPANY_OS_AGENT_STATE_VOLUME: `${manifest.site.id}-agent-state`,
    COMPANY_OS_AGENT_WORK_VOLUME: `${manifest.site.id}-agent-work`,
    COMPANY_OS_POSTGRES_TLS_SERVER_NAME: manifest.dependencies.postgres.tlsServerName,
    COMPANY_OS_OIDC_TLS_HOST: new URL(manifest.dependencies.oidc.issuer).hostname,
    COMPANY_OS_VAULT_TLS_HOST: new URL(manifest.dependencies.vault.baseUrl).hostname,
    COMPANY_OS_VAULT_BASE_URL: manifest.dependencies.vault.baseUrl,
    COMPANY_OS_OIDC_DISCOVERY_URL: manifest.dependencies.oidc.discoveryUrl,
    COMPANY_OS_BROKER_TLS_HOST: new URL(manifest.dependencies.secretBroker.baseUrl).hostname,
    COMPANY_OS_AGENT_TLS_HOST: new URL(manifest.dependencies.agentNode.baseUrl).hostname,
    COMPANY_OS_AGENT_BASE_URL: manifest.dependencies.agentNode.baseUrl,
    COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL: manifest.dependencies.secretBroker.baseUrl,
    COMPANY_OS_POSTGRES_BOOTSTRAP_FILENAME: file("POSTGRES_BOOTSTRAP"),
    COMPANY_OS_VAULT_APPROLE_ROLE_ID_FILENAME: file("VAULT_APPROLE_ROLE_ID"),
    COMPANY_OS_VAULT_APPROLE_SECRET_ID_FILENAME: file("VAULT_APPROLE_SECRET_ID"),
    COMPANY_OS_BROKER_CONTROL_TOKEN_FILENAME: file("BROKER_CONTROL_TOKEN"),
    COMPANY_OS_BROKER_EXECUTION_TOKEN_FILENAME: file("BROKER_EXECUTION_TOKEN"),
    COMPANY_OS_BROKER_SIGNING_KEY_FILENAME: file("BROKER_SIGNING_KEY"),
    COMPANY_OS_AGENT_NODE_TOKEN_FILENAME: file("AGENT_NODE_TOKEN"),
    COMPANY_OS_INTERNAL_TLS_CERT_FILENAME: file("INTERNAL_TLS_CERT"),
    COMPANY_OS_INTERNAL_TLS_KEY_FILENAME: file("INTERNAL_TLS_KEY"),
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

export function renderReferenceDependencyPublicConfiguration(
  manifest: SiteRuntimeManifest,
  metadata: DependencySecretMetadata,
): Readonly<Record<"vault.hcl" | "secret-references.json", string>> {
  if (metadata.siteId !== manifest.site.id) invalidSite();
  const filenames = new Map(metadata.entries.map(({ purpose, filename }) => [purpose, filename]));
  const file = (purpose: DependencySecretPurpose) => {
    const value = filenames.get(purpose);
    if (!value) invalidSite();
    return value;
  };
  const vaultHost = new URL(manifest.dependencies.vault.baseUrl).hostname;
  const vault = [
    "ui = false",
    "disable_mlock = true",
    'storage "file" {',
    '  path = "/vault/file"',
    "}",
    'listener "tcp" {',
    '  address = "0.0.0.0:8200"',
    `  tls_cert_file = "/run/dependency-secrets/${file("INTERNAL_TLS_CERT")}"`,
    `  tls_key_file = "/run/dependency-secrets/${file("INTERNAL_TLS_KEY")}"`,
    '  tls_min_version = "tls12"',
    "}",
    `api_addr = "https://${vaultHost}:8200"`,
    `cluster_addr = "https://${vaultHost}:8201"`,
    "",
  ].join("\n");
  const references = {
    schemaVersion: 1,
    references: [],
    managementProfiles: [{ purpose: "MODEL_PROVIDER",
      providerAdapterId: manifest.dependencies.provider.registrationId, mount: "company-os",
      pathPrefix: `${manifest.site.id}/model-providers`, field: "api_key",
      environmentVariable: "MODEL_PROVIDER_API_KEY" }],
  };
  const result = { "vault.hcl": vault,
    "secret-references.json": `${JSON.stringify(references)}\n` } as const;
  rejectMaterial(result, invalidSite);
  return result;
}

export function planDependencySecretProjections(
  manifest: SiteRuntimeManifest,
  metadata: DependencySecretMetadata,
  projectionRootDirectory = `${manifest.site.deploymentRoot}/dependency-secret-projections`,
): DependencySecretProjectionPlan {
  if (metadata.siteId !== manifest.site.id || !safeAbsolutePath(projectionRootDirectory) ||
      projectionRootDirectory === "/") invalidSecretMetadata();
  const entries = new Map(metadata.entries.map((entry) => [entry.purpose, entry]));
  const entry = (purpose: DependencySecretPurpose) => {
    const value = entries.get(purpose);
    if (!value) invalidSecretMetadata();
    return value;
  };
  const source = (purpose: DependencySecretPurpose) =>
    `${metadata.directory}/${entry(purpose).filename}`;
  const definitions: readonly [DependencySecretProjectionConsumer, string, string | null,
    readonly DependencySecretPurpose[]][] = [
    ["POSTGRES", manifest.dependencies.postgres.image, "postgres",
      ["POSTGRES_BOOTSTRAP", "INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY"]],
    ["VAULT", manifest.dependencies.vault.image, "vault", ["INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY"]],
    ["VAULT_SECRET_BROKER", manifest.dependencies.secretBroker.image, null,
      ["VAULT_APPROLE_ROLE_ID", "VAULT_APPROLE_SECRET_ID", "BROKER_CONTROL_TOKEN",
        "BROKER_EXECUTION_TOKEN", "BROKER_SIGNING_KEY", "INTERNAL_TLS_CERT"]],
    ["CODEX_AGENT_NODE", manifest.dependencies.agentNode.image, null,
      ["BROKER_EXECUTION_TOKEN", "AGENT_NODE_TOKEN", "INTERNAL_TLS_CERT"]],
    ["TLS_GATEWAY", CADDY_IMAGE, "1000:1000", ["INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY"]],
    ["DEPENDENCY_VERIFIER", manifest.product.images.ops, null,
      ["BROKER_CONTROL_TOKEN", "AGENT_NODE_TOKEN", "INTERNAL_TLS_CERT"]],
  ];
  const slug = (consumer: DependencySecretProjectionConsumer) => consumer.toLowerCase().replaceAll("_", "-");
  const projections = definitions.map(([consumer, image, runtimeUser, purposes]) => {
    const directory = `${projectionRootDirectory}/${slug(consumer)}`;
    return { consumer, image, runtimeOwnerResolution: runtimeUser === null ?
      "OCI_IMAGE_DECLARED_USER" as const : "OCI_IMAGE_EXPLICIT_ACCOUNT" as const, runtimeUser, directory,
      files: purposes.map((purpose) => ({ purpose, sourcePath: source(purpose),
        targetPath: `${directory}/${entry(purpose).filename}`, mode: entry(purpose).mode })) };
  });
  const bootstrapInputs = ([
    ["OIDC_BOOTSTRAP", "OIDC_PRIVATE_CONFIG"], ["OIDC_CLIENT", "OIDC_PRIVATE_CONFIG"],
    ["VAULT_INITIALIZATION", "VAULT_BOOTSTRAP"], ["AGENT_PROVIDER", "VAULT_BOOTSTRAP"],
  ] as const).map(([purpose, consumedBy]) => ({ purpose, sourcePath: source(purpose), consumedBy }));
  const result = { schemaVersion: 1, siteId: manifest.site.id, status: "PLANNED_NOT_APPLIED",
    sourceDirectory: metadata.directory, bootstrapInputs, projections } satisfies DependencySecretProjectionPlan;
  rejectMaterial(result, invalidSecretMetadata);
  return result;
}

export function parseDependencySecretMetadata(
  value: unknown,
  expectedSiteId?: string,
): DependencySecretMetadata {
  try {
    const root = exactRecord(value, ["schemaVersion", "siteId", "directory", "entries"]);
    if (root.schemaVersion !== 1 || !portableName(root.siteId) || !safeAbsolutePath(root.directory) ||
        root.directory === "/" || (expectedSiteId !== undefined && root.siteId !== expectedSiteId) ||
        !Array.isArray(root.entries)) invalidSecretMetadata();
    const entries = root.entries.map(parseSecretEntry);
    const purposes = entries.map(({ purpose }) => purpose);
    const filenames = entries.map(({ filename }) => filename);
    if (entries.length !== DEPENDENCY_SECRET_PURPOSES.length || new Set(purposes).size !== purposes.length ||
        new Set(filenames).size !== filenames.length ||
        DEPENDENCY_SECRET_PURPOSES.some((purpose) => !purposes.includes(purpose))) invalidSecretMetadata();
    const result = { schemaVersion: 1, siteId: root.siteId, directory: root.directory,
      entries } satisfies DependencySecretMetadata;
    rejectMaterial(result, invalidSecretMetadata);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === "DEPENDENCY_SECRET_METADATA_INVALID") throw error;
    invalidSecretMetadata();
  }
}

function parseSite(value: unknown): SiteRuntimeManifest["site"] {
  const record = exactRecord(value, ["id", "role", "region", "deploymentRoot", "composeProject",
    "productNetwork", "dependencyNetwork", "ports", "resourceBudget"]);
  if (!portableName(record.id) || !["ACTIVE", "STANDBY"].includes(String(record.role)) ||
      !portableName(record.region) || !safeAbsolutePath(record.deploymentRoot) ||
      !portableName(record.composeProject) || !networkName(record.productNetwork) ||
      !networkName(record.dependencyNetwork) || record.productNetwork === record.dependencyNetwork) invalidSite();
  const ports = exactRecord(record.ports, ["referenceDataNode", "web", "api"]);
  const portValues = [ports.referenceDataNode, ports.web, ports.api];
  if (!portValues.every(port) || new Set(portValues).size !== portValues.length) invalidSite();
  const resourceBudget = exactRecord(record.resourceBudget, ["hostMemoryBytes", "minimumAvailableMemoryBytes",
    "maximumDeclaredMemoryBytes", "requiredHeadroomBytes", "maximumCpu", "maximumPids"]);
  const wholeBytes = [resourceBudget.hostMemoryBytes, resourceBudget.minimumAvailableMemoryBytes,
    resourceBudget.maximumDeclaredMemoryBytes, resourceBudget.requiredHeadroomBytes];
  if (!wholeBytes.every(positiveSafeInteger) || Number(resourceBudget.minimumAvailableMemoryBytes) < 2_147_483_648 ||
      Number(resourceBudget.requiredHeadroomBytes) < 536_870_912 || !positiveFinite(resourceBudget.maximumCpu) ||
      !positiveSafeInteger(resourceBudget.maximumPids)) invalidSite();
  if (Number(resourceBudget.maximumDeclaredMemoryBytes) + Number(resourceBudget.requiredHeadroomBytes) >
      Number(resourceBudget.hostMemoryBytes)) throw new Error("SITE_RUNTIME_RESOURCE_HEADROOM_INSUFFICIENT");
  return { id: String(record.id), role: record.role as "ACTIVE" | "STANDBY", region: String(record.region),
    deploymentRoot: String(record.deploymentRoot), composeProject: String(record.composeProject),
    productNetwork: String(record.productNetwork), dependencyNetwork: String(record.dependencyNetwork),
    ports: { referenceDataNode: Number(ports.referenceDataNode), web: Number(ports.web), api: Number(ports.api) },
    resourceBudget: { hostMemoryBytes: Number(resourceBudget.hostMemoryBytes),
      minimumAvailableMemoryBytes: Number(resourceBudget.minimumAvailableMemoryBytes),
      maximumDeclaredMemoryBytes: Number(resourceBudget.maximumDeclaredMemoryBytes),
      requiredHeadroomBytes: Number(resourceBudget.requiredHeadroomBytes),
      maximumCpu: Number(resourceBudget.maximumCpu), maximumPids: Number(resourceBudget.maximumPids) } };
}

function parseProduct(value: unknown): SiteRuntimeManifest["product"] {
  const record = exactRecord(value, ["releaseId", "exposure", "webOrigin", "apiOrigin", "oidcRedirectUri",
    "instanceId", "connectorIds", "images"]);
  if (typeof record.releaseId !== "string" || !RELEASE_ID.test(record.releaseId) ||
      !["PUBLIC", "PRIVATE"].includes(String(record.exposure)) || !portableName(record.instanceId)) invalidSite();
  const webOrigin = httpsOrigin(record.webOrigin); const apiOrigin = httpsOrigin(record.apiOrigin);
  if (webOrigin === apiOrigin) invalidSite();
  const redirect = httpsUrl(record.oidcRedirectUri);
  if (redirect.pathname !== "/api/auth/oauth2/callback/enterprise-oidc" || redirect.search || redirect.hash) invalidSite();
  const connectorIds = exactRecord(record.connectorIds, ["agentNode", "dataNode", "secretBroker"]);
  if (![connectorIds.agentNode, connectorIds.dataNode, connectorIds.secretBroker].every(portableName) ||
      new Set(Object.values(connectorIds)).size !== 3) invalidSite();
  const images = exactRecord(record.images, ["api", "web", "ops", "codexAgentNode", "vaultSecretBroker",
    "referenceDataNode"]);
  if (Object.values(images).some((image) => typeof image !== "string" || !IMMUTABLE_IMAGE.test(image))) invalidSite();
  return { releaseId: record.releaseId, exposure: record.exposure as "PUBLIC" | "PRIVATE", webOrigin, apiOrigin,
    oidcRedirectUri: redirect.href, instanceId: String(record.instanceId),
    connectorIds: { agentNode: String(connectorIds.agentNode), dataNode: String(connectorIds.dataNode),
      secretBroker: String(connectorIds.secretBroker) }, images: images as unknown as ProductImages };
}

function parseDependencies(value: unknown): SiteRuntimeManifest["dependencies"] {
  const root = exactRecord(value, ["postgres", "oidc", "vault", "secretBroker", "agentNode",
    "referenceDataNode", "provider"]);
  const postgres = imageOwned(root.postgres, ["majorVersion", "volume", "tlsServerName"]);
  if (postgres.extra.majorVersion !== 16 || !portableName(postgres.extra.volume) ||
      typeof postgres.extra.tlsServerName !== "string" || !TLS_SERVER_NAME.test(postgres.extra.tlsServerName)) invalidSite();
  const oidc = imageOwned(root.oidc,
    ["runtime", "issuer", "discoveryUrl", "clientId", "callbackUri", "volume"]);
  const oidcIssuer = httpsOrigin(oidc.extra.issuer); const discovery = httpsUrl(oidc.extra.discoveryUrl);
  const callback = httpsUrl(oidc.extra.callbackUri);
  if (oidc.extra.runtime !== "DEX" || discovery.origin !== oidcIssuer ||
      discovery.pathname !== "/.well-known/openid-configuration" ||
      !portableName(oidc.extra.clientId) || !portableName(oidc.extra.volume)) invalidSite();
  const vault = imageOwned(root.vault, ["baseUrl", "volume"]);
  const vaultBaseUrl = httpsOrigin(vault.extra.baseUrl);
  if (!portableName(vault.extra.volume)) invalidSite();
  const secretBroker = idDependency(root.secretBroker);
  const agentNode = idDependency(root.agentNode);
  const referenceData = imageOwned(root.referenceDataNode, ["id", "baseUrl", "volume", "fixtureOnly"]);
  if (!portableName(referenceData.extra.id) || !portableName(referenceData.extra.volume) ||
      referenceData.extra.fixtureOnly !== true) invalidSite();
  const referenceBaseUrl = httpsOrigin(referenceData.extra.baseUrl);
  const providerRecord = exactRecord(root.provider,
    ["registrationId", "executionOwner", "ownerReference", "evidenceReference"]);
  ownedReferences(providerRecord);
  if (!portableName(providerRecord.registrationId) || providerRecord.executionOwner !== "AGENT_NODE") invalidSite();
  const origins = [vaultBaseUrl, secretBroker.baseUrl, agentNode.baseUrl, referenceBaseUrl];
  const volumes = [String(postgres.extra.volume), String(oidc.extra.volume), String(vault.extra.volume),
    String(referenceData.extra.volume)];
  if (new Set(origins).size !== origins.length || new Set(volumes).size !== volumes.length) invalidSite();
  return {
    postgres: { ...postgres.owned, majorVersion: 16, volume: String(postgres.extra.volume),
      tlsServerName: String(postgres.extra.tlsServerName) },
    oidc: { ...oidc.owned, runtime: "DEX", issuer: oidcIssuer, discoveryUrl: discovery.href,
      clientId: String(oidc.extra.clientId), callbackUri: callback.href, volume: String(oidc.extra.volume) },
    vault: { ...vault.owned, baseUrl: vaultBaseUrl, volume: String(vault.extra.volume) },
    secretBroker, agentNode,
    referenceDataNode: { ...referenceData.owned, id: String(referenceData.extra.id), baseUrl: referenceBaseUrl,
      volume: String(referenceData.extra.volume), fixtureOnly: true },
    provider: { registrationId: String(providerRecord.registrationId), executionOwner: "AGENT_NODE",
      ownerReference: String(providerRecord.ownerReference), evidenceReference: String(providerRecord.evidenceReference) },
  };
}

function parseCapabilities(value: unknown): SiteRuntimeManifest["capabilities"] {
  const record = exactRecord(value, ["publicIngress", "offSiteBackup", "modelInference", "enterpriseData"]);
  if (!["ENABLED", "DISABLED_PENDING_AUTHORIZATION"].includes(String(record.publicIngress)) ||
      !["ENABLED", "DISABLED_PENDING_AUTHORIZATION"].includes(String(record.offSiteBackup)) ||
      record.modelInference !== "EXTERNAL" || record.enterpriseData !== "EXTERNAL") invalidSite();
  return record as unknown as SiteRuntimeManifest["capabilities"];
}

function parseAuthorization(value: unknown): SiteRuntimeManifest["authorization"] {
  const record = exactRecord(value,
    ["dependencyInitialization", "migrationProvision", "productStart", "acceptance"]);
  for (const item of Object.values(record)) {
    if (item !== null && (typeof item !== "string" || !REFERENCE.test(item))) invalidSite();
  }
  return record as unknown as SiteRuntimeManifest["authorization"];
}

function parseSecretEntry(value: unknown): DependencySecretEntry {
  const record = exactRecord(value, ["purpose", "filename", "ownerReference", "consumer", "generationMethod",
    "rotationClass", "mode"]);
  if (!DEPENDENCY_SECRET_PURPOSES.includes(record.purpose as DependencySecretPurpose) ||
      typeof record.filename !== "string" || !FILENAME.test(record.filename) ||
      typeof record.ownerReference !== "string" || !REFERENCE.test(record.ownerReference) ||
      typeof record.consumer !== "string" || !REFERENCE.test(record.consumer) ||
      !["GENERATED_ON_TARGET", "BOOTSTRAP_OUTPUT", "VAULT_RENDERED"].includes(String(record.generationMethod)) ||
      !["ROTATABLE", "CERTIFICATE_LIFECYCLE", "RECOVERY_CONTROLLED"].includes(String(record.rotationClass)) ||
      ![0o400, 0o600].includes(Number(record.mode))) invalidSecretMetadata();
  return record as unknown as DependencySecretEntry;
}

function idDependency(value: unknown): ImageOwned & { readonly id: string; readonly baseUrl: string } {
  const parsed = imageOwned(value, ["id", "baseUrl"]);
  if (!portableName(parsed.extra.id)) invalidSite();
  return { ...parsed.owned, id: String(parsed.extra.id), baseUrl: httpsOrigin(parsed.extra.baseUrl) };
}

function imageOwned(value: unknown, extras: readonly string[]) {
  const record = exactRecord(value, ["image", ...extras, "ownerReference", "evidenceReference"]);
  if (typeof record.image !== "string" || !IMMUTABLE_IMAGE.test(record.image)) invalidSite();
  ownedReferences(record);
  const extra = Object.fromEntries(extras.map((key) => [key, record[key]]));
  return { owned: { image: record.image, ownerReference: String(record.ownerReference),
    evidenceReference: String(record.evidenceReference) }, extra };
}

function ownedReferences(record: Record<string, unknown>) {
  if (typeof record.ownerReference !== "string" || !REFERENCE.test(record.ownerReference) ||
      typeof record.evidenceReference !== "string" || !REFERENCE.test(record.evidenceReference)) invalidSite();
}

function ownedCoordinates(value: SiteRuntimeManifest): string[] {
  return [value.site.composeProject, value.site.productNetwork, value.site.dependencyNetwork,
    value.product.instanceId, value.product.webOrigin, value.product.apiOrigin, value.product.oidcRedirectUri,
    value.product.connectorIds.agentNode, value.product.connectorIds.dataNode, value.product.connectorIds.secretBroker,
    value.dependencies.postgres.volume, value.dependencies.postgres.tlsServerName,
    value.dependencies.oidc.issuer, value.dependencies.oidc.discoveryUrl, value.dependencies.oidc.clientId,
    value.dependencies.oidc.callbackUri, value.dependencies.oidc.volume, value.dependencies.vault.baseUrl,
    value.dependencies.vault.volume, value.dependencies.secretBroker.id, value.dependencies.secretBroker.baseUrl,
    value.dependencies.agentNode.id, value.dependencies.agentNode.baseUrl, value.dependencies.referenceDataNode.id,
    value.dependencies.referenceDataNode.baseUrl, value.dependencies.referenceDataNode.volume,
    value.dependencies.provider.registrationId];
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidSite();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some((key) => !(key in record)) ||
      actual.some((key) => !keys.includes(key))) invalidSite();
  return record;
}

function httpsOrigin(value: unknown): string {
  const url = httpsUrl(value);
  if (url.pathname !== "/" || url.search || url.hash) invalidSite();
  return url.origin;
}

function httpsUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 512) invalidSite();
  let url: URL;
  try { url = new URL(value); } catch { return invalidSite(); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) invalidSite();
  return url;
}

function safeAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && /^\/[A-Za-z0-9._/-]{2,255}$/.test(value) &&
    !value.includes("..") && !value.includes("//");
}

function portableName(value: unknown): value is string {
  return typeof value === "string" && PORTABLE_NAME.test(value);
}

function networkName(value: unknown): value is string {
  return typeof value === "string" && NETWORK_NAME.test(value);
}

function port(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1024 && Number(value) <= 65_535;
}

function positiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function positiveFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function rejectMaterial(value: unknown, invalid: () => never) {
  const text = JSON.stringify(value);
  if (REDACTED_MATERIAL.some((pattern) => pattern.test(text))) invalid();
}

function invalidSite(): never { throw new Error("SITE_RUNTIME_MANIFEST_INVALID"); }
function invalidSecretMetadata(): never { throw new Error("DEPENDENCY_SECRET_METADATA_INVALID"); }
