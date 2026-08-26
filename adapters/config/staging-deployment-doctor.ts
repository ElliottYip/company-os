const IMMUTABLE_IMAGE = /^[a-z0-9][a-z0-9./_-]*@sha256:[a-f0-9]{64}$/;
const SECRET_KEY = /(?:^|_)(?:CLIENT_SECRET|SESSION_SIGNING_KEY|BEARER_TOKEN|PASSWORD|DATABASE_URL|PRIVATE_KEY|CREDENTIALS?)$/i;
const PUBLIC_KEY = /^[A-Z][A-Z0-9_]{0,127}$/;
const REQUIRED_SECRET_FILES = [
  "migration-database-url", "runtime-database-url", "runtime-database-password",
  "oidc-client-secret", "session-signing-key", "agent-node-bearer-token",
  "data-node-bearer-token", "secret-broker-bearer-token",
] as const;
const IMAGE_KEYS = ["COMPANY_OS_API_IMAGE", "COMPANY_OS_WEB_IMAGE", "COMPANY_OS_OPS_IMAGE"] as const;
const HTTPS_KEYS = ["COMPANY_OS_OIDC_ISSUER", "COMPANY_OS_OIDC_DISCOVERY_URL",
  "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL", "COMPANY_OS_HTTP_DATA_NODE_BASE_URL",
  "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL"] as const;

export interface StagingDeploymentSnapshot {
  readonly root: { readonly path: string; readonly exists: boolean; readonly mode: number | null };
  readonly secretDirectory: { readonly path: string; readonly exists: boolean; readonly mode: number | null;
    readonly files: readonly { readonly name: string; readonly kind: "file" | "symlink" | "other";
      readonly mode: number; readonly size: number }[] };
  readonly runtime: { readonly dockerAvailable: boolean; readonly composeAvailable: boolean;
    readonly cpuCount: number; readonly totalMemoryBytes: number; readonly freeDiskBytes: number };
  readonly target: { readonly composeProjectExists: boolean; readonly targetNetworkExists: boolean;
    readonly loopbackPorts: readonly { readonly port: 4600 | 4601;
      readonly status: "FREE" | "OCCUPIED" | "UNKNOWN" }[] };
  readonly publicEnvironment: Readonly<Record<string, string>>;
}

export interface StagingDoctorFinding {
  readonly code: string;
  readonly subject: string;
}

export interface StagingDoctorResult {
  readonly schemaVersion: 1;
  readonly mode: "INSTALL";
  readonly status: "READY" | "NOT_READY";
  readonly findings: readonly StagingDoctorFinding[];
}

export function evaluateStagingDeploymentReadiness(snapshot: StagingDeploymentSnapshot): StagingDoctorResult {
  const findings: StagingDoctorFinding[] = [];
  const add = (code: string, subject: string) => findings.push({ code, subject });
  if (!snapshot.root.exists) add("STAGING_ROOT_MISSING", "deployment-root");
  else if (snapshot.root.mode === null || (snapshot.root.mode & 0o027) !== 0) {
    add("STAGING_ROOT_MODE_UNSAFE", "deployment-root");
  }
  if (!snapshot.secretDirectory.exists) add("SECRET_DIRECTORY_MISSING", "secret-directory");
  else {
    if (snapshot.secretDirectory.mode !== 0o700) add("SECRET_DIRECTORY_MODE_UNSAFE", "secret-directory");
    const files = new Map(snapshot.secretDirectory.files.map((file) => [file.name, file]));
    for (const name of REQUIRED_SECRET_FILES) {
      const file = files.get(name);
      if (!file) add("SECRET_FILE_MISSING", name);
      else if (file.kind !== "file" || (file.mode & 0o077) !== 0 || file.size < 1 || file.size > 16_384) {
        add("SECRET_FILE_UNSAFE", name);
      }
    }
  }
  if (!snapshot.runtime.dockerAvailable) add("DOCKER_UNAVAILABLE", "docker");
  if (!snapshot.runtime.composeAvailable) add("COMPOSE_UNAVAILABLE", "docker-compose");
  if (snapshot.runtime.cpuCount < 2 || snapshot.runtime.totalMemoryBytes < 1_500_000_000) {
    add("HOST_COMPUTE_BUDGET_INSUFFICIENT", "host-compute");
  }
  if (snapshot.runtime.freeDiskBytes < 8_000_000_000) add("HOST_DISK_BUDGET_INSUFFICIENT", "host-disk");
  if (snapshot.target.composeProjectExists) add("STAGING_PROJECT_ALREADY_EXISTS", "company-os-staging");
  if (snapshot.target.targetNetworkExists) add("STAGING_NETWORK_ALREADY_EXISTS", "company-os-staging_internal");
  for (const port of snapshot.target.loopbackPorts) {
    if (port.status === "OCCUPIED") add("STAGING_PORT_OCCUPIED", `127.0.0.1:${port.port}`);
    if (port.status === "UNKNOWN") add("STAGING_PORT_PROBE_FAILED", `127.0.0.1:${port.port}`);
  }
  for (const key of IMAGE_KEYS) {
    if (!IMMUTABLE_IMAGE.test(snapshot.publicEnvironment[key] ?? "")) add("STAGING_IMAGE_NOT_IMMUTABLE", key);
  }
  if (!snapshot.publicEnvironment.COMPANY_OS_OIDC_CLIENT_ID?.trim()) {
    add("STAGING_PUBLIC_CONFIG_MISSING", "COMPANY_OS_OIDC_CLIENT_ID");
  }
  for (const key of HTTPS_KEYS) {
    if (!strictHttpsUrl(snapshot.publicEnvironment[key])) add("STAGING_HTTPS_COORDINATE_REQUIRED", key);
  }
  return { schemaVersion: 1, mode: "INSTALL", status: findings.length ? "NOT_READY" : "READY", findings };
}

export function parsePublicStagingEnvironment(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`STAGING_PUBLIC_ENV_INVALID:${index + 1}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!PUBLIC_KEY.test(key)) throw new Error(`STAGING_PUBLIC_ENV_INVALID:${index + 1}`);
    if (SECRET_KEY.test(key)) throw new Error(`STAGING_PUBLIC_ENV_SECRET_KEY_FORBIDDEN:${key}`);
    if (Object.hasOwn(result, key)) throw new Error(`STAGING_PUBLIC_ENV_DUPLICATE_KEY:${key}`);
    result[key] = value;
  }
  return result;
}

function strictHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
