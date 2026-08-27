import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

import { parseStagingDependencyManifest } from
  "../adapters/config/staging-dependency-manifest.ts";
import type { StagingDependencyExpectation } from
  "../adapters/config/staging-dependency-manifest.ts";
import { parsePublicStagingEnvironment } from
  "../adapters/config/staging-deployment-doctor.ts";

const MAX_BYTES = 64 * 1024;

export function stagingDependencyExpectationFromPublicEnvironment(
  environment: Readonly<Record<string, string>>,
  deploymentRoot: string,
): StagingDependencyExpectation {
  const required = (key: string) => {
    const value = environment[key]?.trim();
    if (!value) throw new Error("STAGING_SITE_EXPECTATION_INVALID");
    return value;
  };
  const port = (key: string) => {
    const value = Number(required(key));
    if (!Number.isSafeInteger(value) || value < 1024 || value > 65_535) {
      throw new Error("STAGING_SITE_EXPECTATION_INVALID");
    }
    return value;
  };
  if (!deploymentRoot.startsWith("/") || deploymentRoot.includes("..")) {
    throw new Error("STAGING_SITE_EXPECTATION_INVALID");
  }
  return {
    deploymentId: required("COMPANY_OS_INSTANCE_ID"),
    webOrigin: required("COMPANY_OS_WEB_ORIGINS"),
    apiOrigin: required("COMPANY_OS_PUBLIC_URL"),
    deploymentRoot,
    composeProject: required("COMPANY_OS_COMPOSE_PROJECT"),
    network: required("COMPANY_OS_PRODUCT_NETWORK"),
    webLoopbackPort: port("COMPANY_OS_WEB_LOOPBACK_PORT"),
    apiLoopbackPort: port("COMPANY_OS_API_LOOPBACK_PORT"),
  };
}

export async function validateStagingDependencies(
  path: string,
  expectation: StagingDependencyExpectation,
) {
  if (!path.startsWith("/")) throw new Error("STAGING_DEPENDENCY_PATH_ABSOLUTE_REQUIRED");
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      metadata.size < 2 || metadata.size > MAX_BYTES || (metadata.mode & 0o022) !== 0) {
    throw new Error("STAGING_DEPENDENCY_FILE_UNSAFE");
  }
  let raw: string; let value: unknown;
  try { raw = await readFile(path, "utf8"); value = JSON.parse(raw); }
  catch { throw new Error("STAGING_DEPENDENCY_FILE_INVALID"); }
  const manifest = parseStagingDependencyManifest(value, expectation);
  return { schemaVersion: 1 as const, status: "READY_FOR_STAGING_DEPLOYMENT" as const,
    deploymentId: manifest.deploymentId,
    manifestDigest: `sha256:${createHash("sha256").update(canonicalJson(manifest)).digest("hex")}`,
    capabilities: ["INGRESS", "POSTGRESQL", "OIDC", "VAULT_BROKER", "AGENT_NODE", "DATA_NODE", "BACKUP"],
    ownership: "DEDICATED" as const,
    secretsPresent: false as const };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  if (process.argv.length !== 5) throw new Error("STAGING_DEPENDENCY_ARGUMENTS_INVALID");
  const environment = parsePublicStagingEnvironment(await readFile(process.argv[3]!, "utf8"));
  const expectation = stagingDependencyExpectationFromPublicEnvironment(environment, process.argv[4]!);
  process.stdout.write(`${JSON.stringify(await validateStagingDependencies(
    process.argv[2]!, expectation), null, 2)}\n`);
}
