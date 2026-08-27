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
    readonly oidc: ImageOwned & { readonly issuer: string; readonly discoveryUrl: string;
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

type DependencySecretPurpose = typeof DEPENDENCY_SECRET_PURPOSES[number];

const DEPENDENCY_SECRET_PURPOSES = [
  "POSTGRES_BOOTSTRAP", "OIDC_BOOTSTRAP", "OIDC_CLIENT", "VAULT_INITIALIZATION",
  "VAULT_APPROLE", "BROKER_VAULT", "AGENT_PROVIDER", "INTERNAL_TLS_CERT", "INTERNAL_TLS_KEY",
] as const;
const IMMUTABLE_IMAGE = /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/;
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
  const oidc = imageOwned(root.oidc, ["issuer", "discoveryUrl", "clientId", "callbackUri", "volume"]);
  const oidcIssuer = httpsOrigin(oidc.extra.issuer); const discovery = httpsUrl(oidc.extra.discoveryUrl);
  const callback = httpsUrl(oidc.extra.callbackUri);
  if (discovery.origin !== oidcIssuer || discovery.pathname !== "/.well-known/openid-configuration" ||
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
    oidc: { ...oidc.owned, issuer: oidcIssuer, discoveryUrl: discovery.href,
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
