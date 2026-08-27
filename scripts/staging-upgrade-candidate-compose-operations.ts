import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parsePublicStagingEnvironment } from
  "../adapters/config/staging-deployment-doctor.ts";
import type { StagingUpgradePreparationStepRecord } from
  "./create-staging-upgrade-preparation-adapter.ts";

type CandidateStep = "start-candidate-secret-broker" | "start-candidate-data-node" |
  "start-candidate-agent-node" | "start-candidate-api" | "candidate-readiness" |
  "start-candidate-web";
type CommandResult = { readonly status: number | null; readonly stdout: string };
type ServiceState = { readonly service: string; readonly image: string;
  readonly state: "running"; readonly health: "healthy" | "not-declared" };

const OUTCOMES: Record<CandidateStep, StagingUpgradePreparationStepRecord["outcome"]> = {
  "start-candidate-secret-broker": "CURRENT_VAULT_SECRET_BROKER_DIGEST_READY",
  "start-candidate-data-node": "CURRENT_REFERENCE_DATA_NODE_DIGEST_READY_AND_FIXTURE_ONLY",
  "start-candidate-agent-node": "CURRENT_CODEX_AGENT_NODE_DIGEST_READY",
  "start-candidate-api": "CURRENT_DIGEST_STARTED_WITH_INGRESS_CLOSED",
  "candidate-readiness": "DEPENDENCY_AWARE_READY",
  "start-candidate-web": "CURRENT_WEB_DIGEST_SERVED",
};

export async function createStagingUpgradeCandidateComposeOperations(input: {
  readonly candidateDirectory: string;
  readonly operationId: string;
  readonly siteId: string;
  readonly candidateReleaseId: string;
}, supplied: {
  readonly runCommand?: (argv: readonly string[]) => Promise<CommandResult>;
  readonly probe?: (url: string) => Promise<boolean>;
  readonly now?: () => string;
} = {}) {
  const directory = await privateDirectory(input.candidateDirectory);
  const environmentFile = join(directory, "candidate.env");
  const productCompose = join(directory, "compose.staging.yml");
  const executionCompose = join(directory, "compose.staging-upgrade-candidate.yml");
  await Promise.all([privateFile(environmentFile), privateFile(productCompose), privateFile(executionCompose)]);
  const environment = parsePublicStagingEnvironment(await readFile(environmentFile, "utf8"));
  const apiPort = port(environment.COMPANY_OS_API_LOOPBACK_PORT);
  const webPort = port(environment.COMPANY_OS_WEB_LOOPBACK_PORT);
  const command = supplied.runCommand ?? defaultCommand;
  const probe = supplied.probe ?? defaultProbe;
  const now = supplied.now ?? (() => new Date().toISOString());
  const records = await ensurePrivate(join(directory, "step-evidence"));
  const product = ["docker", "compose", "--env-file", environmentFile, "-f", productCompose];
  const execution = ["docker", "compose", "--env-file", environmentFile, "-f", executionCompose];

  const startState = async (compose: readonly string[], service: string, expectedImage: string) => {
    await successful(command([...compose, "up", "-d", "--no-deps", service]),
      `STAGING_UPGRADE_CANDIDATE_START_FAILED:${service}`);
    return inspect(command, compose, service, expectedImage);
  };
  const start = async (step: CandidateStep, compose: readonly string[], service: string,
    expectedImage: string) => {
    const state = await startState(compose, service, expectedImage);
    return retain(step, { services: [state], probePassed: null });
  };
  const retain = async (step: CandidateStep, details: {
    readonly services: readonly ServiceState[]; readonly probePassed: boolean | null }) => {
    const evidence = { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId, step,
      outcome: OUTCOMES[step], capturedAt: now(), services: details.services,
      probePassed: details.probePassed, fixtureOnly: step === "start-candidate-data-node",
      secretMaterialIncluded: false } as const;
    const raw = `${JSON.stringify(evidence, null, 2)}\n`; const evidenceDigest = sha256(raw);
    await writeFile(join(records, `${step}.json`), raw, { flag: "wx", mode: 0o600 });
    return { schemaVersion: 1, product: "company-os", operationId: input.operationId,
      siteId: input.siteId, candidateReleaseId: input.candidateReleaseId, step,
      outcome: OUTCOMES[step], evidenceDigest, secretMaterialIncluded: false } as
      StagingUpgradePreparationStepRecord;
  };

  return {
    "start-candidate-secret-broker": () => start("start-candidate-secret-broker", execution,
      "vault-secret-broker", required(environment.COMPANY_OS_VAULT_SECRET_BROKER_IMAGE)),
    "start-candidate-data-node": () => start("start-candidate-data-node", execution,
      "reference-data-node", required(environment.COMPANY_OS_REFERENCE_DATA_NODE_IMAGE)),
    "start-candidate-agent-node": () => start("start-candidate-agent-node", execution,
      "codex-agent-node", required(environment.COMPANY_OS_CODEX_AGENT_NODE_IMAGE)),
    "start-candidate-api": () => start("start-candidate-api", product, "api",
      required(environment.COMPANY_OS_API_IMAGE)),
    "candidate-readiness": async () => {
      const services = await Promise.all([
        inspect(command, execution, "vault-secret-broker", required(environment.COMPANY_OS_VAULT_SECRET_BROKER_IMAGE)),
        inspect(command, execution, "reference-data-node", required(environment.COMPANY_OS_REFERENCE_DATA_NODE_IMAGE)),
        inspect(command, execution, "codex-agent-node", required(environment.COMPANY_OS_CODEX_AGENT_NODE_IMAGE)),
        inspect(command, product, "api", required(environment.COMPANY_OS_API_IMAGE)),
      ]);
      if (!await probe(`http://127.0.0.1:${apiPort}/ready`)) {
        throw new Error("STAGING_UPGRADE_CANDIDATE_API_NOT_READY");
      }
      return retain("candidate-readiness", { services, probePassed: true });
    },
    "start-candidate-web": async () => {
      const state = await startState(product, "web", required(environment.COMPANY_OS_WEB_IMAGE));
      if (!await probe(`http://127.0.0.1:${webPort}/`)) {
        throw new Error("STAGING_UPGRADE_CANDIDATE_WEB_NOT_READY");
      }
      return retain("start-candidate-web", { services: [state], probePassed: true });
    },
  };
}

async function inspect(run: (argv: readonly string[]) => Promise<CommandResult>, compose: readonly string[],
  service: string, expectedImage: string): Promise<ServiceState> {
  const result = await run([...compose, "ps", "--format", "json", service]);
  if (result.status !== 0) throw new Error(`STAGING_UPGRADE_CANDIDATE_INSPECTION_FAILED:${service}`);
  const parsed = parseComposePs(result.stdout);
  const match = parsed.find((item) => item.Service === service);
  if (!match || match.Image !== expectedImage || String(match.State).toLowerCase() !== "running") {
    throw new Error(`STAGING_UPGRADE_CANDIDATE_SERVICE_NOT_RUNNING:${service}`);
  }
  const health = String(match.Health ?? "").toLowerCase();
  if (health && health !== "healthy") throw new Error(`STAGING_UPGRADE_CANDIDATE_SERVICE_UNHEALTHY:${service}`);
  return { service, image: expectedImage, state: "running", health: health ? "healthy" : "not-declared" };
}
function parseComposePs(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try { return value.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
    catch { throw new Error("STAGING_UPGRADE_CANDIDATE_INSPECTION_OUTPUT_INVALID"); }
  }
}
async function successful(result: Promise<CommandResult>, code: string) {
  if ((await result).status !== 0) throw new Error(code);
}
function defaultCommand(argv: readonly string[]): Promise<CommandResult> {
  const result = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 600_000 });
  return Promise.resolve({ status: result.status, stdout: result.stdout ?? "" });
}
async function defaultProbe(url: string) {
  try { return (await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3_000) })).ok; }
  catch { return false; }
}
async function privateDirectory(value: string) {
  const path = resolve(value); const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_DIRECTORY_UNSAFE");
  }
  return path;
}
async function ensurePrivate(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (!isCode(error, "EEXIST")) throw error; }
  return privateDirectory(path);
}
async function privateFile(path: string) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_FILE_UNSAFE");
  }
}
function port(value: string | undefined) {
  const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65_535) {
    throw new Error("STAGING_UPGRADE_CANDIDATE_PORT_INVALID");
  }
  return parsed;
}
function required(value: string | undefined) {
  if (!value) throw new Error("STAGING_UPGRADE_CANDIDATE_ENVIRONMENT_INCOMPLETE"); return value;
}
function sha256(value: string) { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
