export interface StagingDependencyManifest {
  readonly schemaVersion: 1;
  readonly environment: "STAGING";
  readonly deploymentId: string;
  readonly ingress: {
    readonly webOrigin: string;
    readonly apiOrigin: string;
    readonly ownerReference: string;
    readonly dnsEvidenceReference: string;
    readonly tlsEvidenceReference: string;
  };
  readonly isolation: {
    readonly deploymentRoot: string;
    readonly composeProject: string;
    readonly network: string;
    readonly webLoopbackPort: number;
    readonly apiLoopbackPort: number;
  };
  readonly postgres: {
    readonly majorVersion: 16;
    readonly ownership: "DEDICATED";
    readonly tlsMode: "VERIFY_FULL";
    readonly coordinateSource: "SECRET_FILES";
    readonly ownerReference: string;
    readonly evidenceReference: string;
  };
  readonly oidc: {
    readonly issuer: string;
    readonly discoveryUrl: string;
    readonly clientId: string;
    readonly ownership: "PRODUCT_SCOPED_CLIENT";
    readonly pkce: "S256";
    readonly ownerReference: string;
    readonly evidenceReference: string;
  };
  readonly vaultBroker: ExternalHttpsDependency;
  readonly agentNode: ExternalHttpsDependency;
  readonly dataNode: ExternalHttpsDependency;
  readonly backup: {
    readonly provider: "ZOS_S3_COMPATIBLE";
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly ownership: "DEDICATED";
    readonly versioning: true;
    readonly objectLock: "DISABLED" | "ENABLED";
    readonly credentialSource: "VAULT_RENDERED_FILES";
    readonly ownerReference: string;
    readonly evidenceReference: string;
  };
}

interface ExternalHttpsDependency {
  readonly baseUrl: string;
  readonly ownership: "DEDICATED";
  readonly ownerReference: string;
  readonly evidenceReference: string;
}

export interface StagingDependencyExpectation {
  readonly deploymentId: string;
  readonly webOrigin: string;
  readonly apiOrigin: string;
  readonly deploymentRoot: string;
  readonly composeProject: string;
  readonly network: string;
  readonly webLoopbackPort: number;
  readonly apiLoopbackPort: number;
}

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const PORTABLE_NAME = /^[a-z0-9][a-z0-9-]{2,95}$/;
const NETWORK_NAME = /^[a-z0-9][a-z0-9_-]{2,95}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const FORBIDDEN_COORDINATES = [
  "buzz-prod", "generator001y", "workflow001y", "raft-client-upload-20260601",
  "/opt/raft-relay", "/opt/raft-gateway", "/opt/generator-api", "/data/raft-h3",
];
const SECRET_MATERIAL = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:hvs\.|sk-)[A-Za-z0-9_-]{16,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
];

export function parseStagingDependencyManifest(
  value: unknown,
  expectation?: StagingDependencyExpectation,
): StagingDependencyManifest {
  const root = exactRecord(value, ["schemaVersion", "environment", "deploymentId", "ingress", "isolation",
    "postgres", "oidc", "vaultBroker", "agentNode", "dataNode", "backup"]);
  if (root.schemaVersion !== 1 || root.environment !== "STAGING" ||
      !portableName(root.deploymentId)) invalid();

  const ingress = exactRecord(root.ingress,
    ["webOrigin", "apiOrigin", "ownerReference", "dnsEvidenceReference", "tlsEvidenceReference"]);
  const webOrigin = httpsOrigin(ingress.webOrigin);
  const apiOrigin = httpsOrigin(ingress.apiOrigin);
  if (webOrigin === apiOrigin) invalid();
  references(ingress, ["ownerReference", "dnsEvidenceReference", "tlsEvidenceReference"]);

  const isolation = exactRecord(root.isolation,
    ["deploymentRoot", "composeProject", "network", "webLoopbackPort", "apiLoopbackPort"]);
  if (!safeAbsolutePath(isolation.deploymentRoot) || !portableName(isolation.composeProject) ||
      typeof isolation.network !== "string" || !NETWORK_NAME.test(isolation.network) ||
      !port(isolation.webLoopbackPort) ||
      !port(isolation.apiLoopbackPort) || isolation.webLoopbackPort === isolation.apiLoopbackPort) invalid();

  const postgres = exactRecord(root.postgres,
    ["majorVersion", "ownership", "tlsMode", "coordinateSource", "ownerReference", "evidenceReference"]);
  if (postgres.majorVersion !== 16 || postgres.ownership !== "DEDICATED" ||
      postgres.tlsMode !== "VERIFY_FULL" || postgres.coordinateSource !== "SECRET_FILES") invalid();
  references(postgres, ["ownerReference", "evidenceReference"]);

  const oidc = exactRecord(root.oidc,
    ["issuer", "discoveryUrl", "clientId", "ownership", "pkce", "ownerReference", "evidenceReference"]);
  const issuer = httpsOrigin(oidc.issuer);
  const discovery = httpsUrl(oidc.discoveryUrl);
  if (oidc.ownership !== "PRODUCT_SCOPED_CLIENT" || oidc.pkce !== "S256" ||
      !portableName(oidc.clientId) || discovery.origin !== issuer ||
      !discovery.pathname.endsWith("/.well-known/openid-configuration")) invalid();
  references(oidc, ["ownerReference", "evidenceReference"]);

  const vaultBroker = dependency(root.vaultBroker);
  const agentNode = dependency(root.agentNode);
  const dataNode = dependency(root.dataNode);
  const dependencyOrigins = [vaultBroker.baseUrl, agentNode.baseUrl, dataNode.baseUrl];
  if (new Set(dependencyOrigins).size !== dependencyOrigins.length ||
      dependencyOrigins.includes(webOrigin) || dependencyOrigins.includes(apiOrigin)) invalid();

  const backup = exactRecord(root.backup,
    ["provider", "endpoint", "region", "bucket", "ownership", "versioning", "objectLock",
      "credentialSource", "ownerReference", "evidenceReference"]);
  if (backup.provider !== "ZOS_S3_COMPATIBLE" || backup.ownership !== "DEDICATED" ||
      backup.versioning !== true || !["DISABLED", "ENABLED"].includes(String(backup.objectLock)) ||
      backup.credentialSource !== "VAULT_RENDERED_FILES" || !BUCKET.test(String(backup.bucket)) ||
      !PORTABLE_NAME.test(String(backup.region))) invalid();
  const backupEndpoint = httpsOrigin(backup.endpoint);
  references(backup, ["ownerReference", "evidenceReference"]);

  const parsed = structuredClone({ ...root, ingress: { ...ingress, webOrigin, apiOrigin },
    isolation, postgres, oidc: { ...oidc, issuer, discoveryUrl: discovery.href },
    vaultBroker, agentNode, dataNode, backup: { ...backup, endpoint: backupEndpoint } }) as StagingDependencyManifest;
  rejectForbiddenOrSecretMaterial(parsed);
  if (expectation) matchExpectation(parsed, expectation);
  return parsed;
}

function dependency(value: unknown): ExternalHttpsDependency {
  const item = exactRecord(value, ["baseUrl", "ownership", "ownerReference", "evidenceReference"]);
  if (item.ownership !== "DEDICATED") invalid();
  references(item, ["ownerReference", "evidenceReference"]);
  return { baseUrl: httpsOrigin(item.baseUrl), ownership: "DEDICATED",
    ownerReference: String(item.ownerReference), evidenceReference: String(item.evidenceReference) };
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record)) ||
      Object.keys(record).some((key) => !keys.includes(key))) invalid();
  return record;
}

function references(record: Record<string, unknown>, keys: readonly string[]) {
  if (keys.some((key) => typeof record[key] !== "string" || !REFERENCE.test(record[key] as string))) invalid();
}

function httpsOrigin(value: unknown): string {
  const url = httpsUrl(value);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) invalid();
  return url.origin;
}

function httpsUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 512) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) invalid();
  return url;
}

function portableName(value: unknown): value is string {
  return typeof value === "string" && PORTABLE_NAME.test(value);
}

function port(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1024 && Number(value) <= 65_535;
}

function safeAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && /^\/[A-Za-z0-9._/-]{2,255}$/.test(value) &&
    !value.includes("..") && !value.includes("//");
}

function rejectForbiddenOrSecretMaterial(value: StagingDependencyManifest) {
  const text = JSON.stringify(value);
  if (FORBIDDEN_COORDINATES.some((coordinate) => text.toLowerCase().includes(coordinate.toLowerCase())) ||
      SECRET_MATERIAL.some((pattern) => pattern.test(text)) || /CHANGE_ME|REPLACE_WITH/i.test(text)) invalid();
}

function matchExpectation(value: StagingDependencyManifest, expected: StagingDependencyExpectation) {
  const actual = [value.deploymentId, value.ingress.webOrigin, value.ingress.apiOrigin,
    value.isolation.deploymentRoot, value.isolation.composeProject, value.isolation.network,
    value.isolation.webLoopbackPort, value.isolation.apiLoopbackPort];
  const wanted = [expected.deploymentId, expected.webOrigin, expected.apiOrigin,
    expected.deploymentRoot, expected.composeProject, expected.network,
    expected.webLoopbackPort, expected.apiLoopbackPort];
  if (actual.some((item, index) => item !== wanted[index])) {
    throw new Error("STAGING_DEPENDENCY_EXPECTATION_MISMATCH");
  }
}

function invalid(): never { throw new Error("STAGING_DEPENDENCY_MANIFEST_INVALID"); }
