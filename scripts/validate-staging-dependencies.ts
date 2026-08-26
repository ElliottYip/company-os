import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

import { parseStagingDependencyManifest } from
  "../adapters/config/staging-dependency-manifest.ts";

const MAX_BYTES = 64 * 1024;
export const raftXinStagingExpectation = {
  deploymentId: "company-os-staging-raft-xin",
  webOrigin: "https://company-os.raft.xin",
  apiOrigin: "https://company-os-api.raft.xin",
  deploymentRoot: "/srv/company-os/staging",
  composeProject: "company-os-staging",
  network: "company-os-staging_internal",
  webLoopbackPort: 4600,
  apiLoopbackPort: 4601,
} as const;

export async function validateStagingDependencies(
  path: string,
  expectation = raftXinStagingExpectation,
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
  if (process.argv.length !== 3) throw new Error("STAGING_DEPENDENCY_ARGUMENTS_INVALID");
  process.stdout.write(`${JSON.stringify(await validateStagingDependencies(process.argv[2]!), null, 2)}\n`);
}
