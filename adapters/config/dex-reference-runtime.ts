import type { SiteRuntimeManifest } from "./site-runtime-contract.ts";

export interface DexBootstrapSecret {
  readonly schemaVersion: 1;
  readonly email: string;
  readonly username: string;
  readonly displayName: string;
  readonly userId: string;
  readonly passwordHash: string;
}

const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function parseDexBootstrapSecret(value: unknown): DexBootstrapSecret {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidBootstrap();
  const record = value as Record<string, unknown>;
  const keys = ["schemaVersion", "email", "username", "displayName", "userId", "passwordHash"];
  if (Object.keys(record).length !== keys.length || keys.some((key) => !(key in record)) ||
      Object.keys(record).some((key) => !keys.includes(key)) || record.schemaVersion !== 1 ||
      typeof record.email !== "string" || record.email.length > 254 || !EMAIL.test(record.email) ||
      typeof record.username !== "string" || !ID.test(record.username) ||
      typeof record.userId !== "string" || !ID.test(record.userId) ||
      typeof record.displayName !== "string" || !boundedText(record.displayName, 128) ||
      typeof record.passwordHash !== "string" || !BCRYPT.test(record.passwordHash)) invalidBootstrap();
  return { schemaVersion: 1, email: record.email, username: record.username,
    displayName: record.displayName, userId: record.userId, passwordHash: record.passwordHash };
}

export function renderDexPrivateConfiguration(
  manifest: SiteRuntimeManifest,
  bootstrap: DexBootstrapSecret,
  clientSecret: string,
): string {
  if (manifest.dependencies.oidc.runtime !== "DEX") throw new Error("DEX_RUNTIME_REQUIRED");
  const identity = parseDexBootstrapSecret(bootstrap);
  if (!boundedText(clientSecret, 512) || clientSecret.length < 32) {
    throw new Error("DEX_CLIENT_SECRET_INVALID");
  }
  const config = {
    issuer: manifest.dependencies.oidc.issuer,
    storage: { type: "sqlite3", config: { file: "/var/dex/dex.db" } },
    web: { http: "0.0.0.0:5556" },
    telemetry: { http: "0.0.0.0:5558" },
    oauth2: { responseTypes: ["code"], skipApprovalScreen: true,
      pkce: { enforce: true, codeChallengeMethodsSupported: ["S256"] } },
    staticClients: [{ id: manifest.dependencies.oidc.clientId, name: "Company OS",
      secret: clientSecret, redirectURIs: [manifest.dependencies.oidc.callbackUri] }],
    enablePasswordDB: true,
    staticPasswords: [{ email: identity.email, hash: identity.passwordHash,
      username: identity.username, name: identity.displayName, emailVerified: true,
      userID: identity.userId }],
  };
  return `${JSON.stringify(config)}\n`;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !/[\0\r\n]/.test(value);
}

function invalidBootstrap(): never { throw new Error("DEX_BOOTSTRAP_SECRET_INVALID"); }
