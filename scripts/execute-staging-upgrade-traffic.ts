import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { parseStagingIngressRouteContract } from
  "../adapters/config/staging-ingress-route-contract.ts";
import { parseStagingUpgradeRuntimeContract } from
  "../adapters/config/staging-upgrade-runtime-contract.ts";
import { createStagingUpgradeTrafficStepAdapter } from
  "./create-staging-upgrade-traffic-adapter.ts";
import { inspectDeploymentDrain } from "./inspect-deployment-drain.ts";
import { createStagingUpgradeTrafficPlan, runStagingUpgradeTraffic } from
  "./run-staging-upgrade-traffic.ts";
import { createStagingUpgradeActivePromotionOperation } from
  "./staging-upgrade-active-promotion-operation.ts";
import { createStagingIngressRouterControl } from "./staging-ingress-router-control.ts";
import { createStagingUpgradeObservationOperation } from
  "./staging-upgrade-observation-operation.ts";
import { createStagingUpgradeRouteOperation } from "./staging-upgrade-route-operation.ts";

type CommandResult = { readonly status: number | null; readonly stdout: string };

export async function executeStagingUpgradeTraffic(input: {
  readonly rootDirectory: string;
  readonly candidateDirectory: string;
  readonly routeDirectory: string;
  readonly authorizationFile: string;
  readonly authorizationReference: string;
  readonly runtimeContractFile: string;
  readonly routeContractFile: string;
  readonly now?: string;
}, supplied: {
  readonly fetch?: typeof fetch;
  readonly inspectCandidate?: typeof inspectDeploymentDrain;
  readonly runCommand?: (argv: readonly string[]) => Promise<CommandResult>;
  readonly wait?: (milliseconds: number) => Promise<void>;
  readonly monotonicNow?: () => number;
  readonly clock?: () => string;
} = {}) {
  const rootDirectory = safeAbsolute(input.rootDirectory);
  const candidateDirectory = safeAbsolute(input.candidateDirectory);
  const routeDirectory = safeAbsolute(input.routeDirectory);
  const [authorizationRaw, runtimeRaw, routeRaw, preparationRaw] = await Promise.all([
    privateFile(input.authorizationFile), privateFile(input.runtimeContractFile),
    privateFile(input.routeContractFile), privateFile(join(rootDirectory, "upgrade-preparation-state.json")),
  ]);
  const authorization = json(authorizationRaw, "STAGING_UPGRADE_TRAFFIC_AUTHORIZATION_INVALID");
  const runtime = parseStagingUpgradeRuntimeContract(json(runtimeRaw,
    "STAGING_UPGRADE_TRAFFIC_RUNTIME_CONTRACT_INVALID"));
  const route = parseStagingIngressRouteContract(json(routeRaw,
    "STAGING_UPGRADE_TRAFFIC_ROUTE_CONTRACT_INVALID"), runtime);
  const now = input.now ?? new Date().toISOString();
  const plan = { ...createStagingUpgradeTrafficPlan(authorization, preparationRaw,
    { now, authorizationReference: input.authorizationReference }), rootDirectory };
  if (plan.siteId !== runtime.siteId || plan.candidate.releaseId !== runtime.candidate.releaseId) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_RUNTIME_BINDING_INVALID");
  }
  const router = await createStagingIngressRouterControl({ routeDirectory,
    routeContract: route, runtimeContract: runtime }, { runCommand: supplied.runCommand });
  const routeOperation = await createStagingUpgradeRouteOperation({ candidateDirectory, routeDirectory,
    operationId: plan.operationId, siteId: plan.siteId, candidateReleaseId: runtime.candidate.releaseId,
    runtimeContract: runtime, routeContract: route }, { ...router, fetch: supplied.fetch,
    now: supplied.clock });
  const observationOperation = await createStagingUpgradeObservationOperation({ candidateDirectory,
    operationId: plan.operationId, siteId: plan.siteId, candidateReleaseId: runtime.candidate.releaseId,
    stablePorts: route.router.stablePorts, policy: route.observation }, { fetch: supplied.fetch,
    inspectCandidate: supplied.inspectCandidate, wait: supplied.wait,
    monotonicNow: supplied.monotonicNow, now: supplied.clock });
  const promotionOperation = await createStagingUpgradeActivePromotionOperation({ rootDirectory,
    candidateDirectory, operationId: plan.operationId, siteId: plan.siteId,
    authorizationReference: plan.authorizationReference,
    expectedActiveStateDigest: authorization.active.startupStateDigest,
    runtimeContract: runtime }, { now: supplied.clock });
  const executeStep = createStagingUpgradeTrafficStepAdapter({ operationId: plan.operationId,
    siteId: plan.siteId, candidateReleaseId: runtime.candidate.releaseId,
    operations: { "route-traffic": routeOperation, observe: observationOperation,
      "promote-active": promotionOperation } });
  return runStagingUpgradeTraffic(plan, { executeStep, now: supplied.clock });
}

function safeAbsolute(value: string) {
  if (!isAbsolute(value)) throw new Error("STAGING_UPGRADE_TRAFFIC_PATH_INVALID"); return resolve(value);
}
async function privateFile(value: string) {
  const path = safeAbsolute(value); const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 ||
      (metadata.mode & 0o077) !== 0 || metadata.size < 2 || metadata.size > 1_048_576) {
    throw new Error("STAGING_UPGRADE_TRAFFIC_FILE_UNSAFE");
  }
  return readFile(path, "utf8");
}
function json(value: string, code: string): any { try { return JSON.parse(value); } catch { throw new Error(code); } }

function argumentsFrom(values: readonly string[]) {
  const result: Record<string, string | boolean | undefined> = { apply: false };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === "--apply") result.apply = true;
    else if (flag === "--root") result.rootDirectory = values[++index];
    else if (flag === "--candidate-directory") result.candidateDirectory = values[++index];
    else if (flag === "--route-directory") result.routeDirectory = values[++index];
    else if (flag === "--authorization-file") result.authorizationFile = values[++index];
    else if (flag === "--authorization") result.authorizationReference = values[++index];
    else if (flag === "--runtime-contract") result.runtimeContractFile = values[++index];
    else if (flag === "--route-contract") result.routeContractFile = values[++index];
    else throw new Error("STAGING_UPGRADE_TRAFFIC_ARGUMENT_INVALID");
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const values = argumentsFrom(process.argv.slice(2));
  if (values.apply !== true) throw new Error("STAGING_UPGRADE_TRAFFIC_APPLY_REQUIRED");
  executeStagingUpgradeTraffic(values as any).then((result) => process.stdout.write(`${JSON.stringify({
    schemaVersion: 1, status: result.status, operationId: result.operationId,
    siteId: result.siteId, candidateReleaseId: result.candidate.releaseId,
    trafficMoved: result.trafficMoved, automaticRollbackAttempted: result.automaticRollbackAttempted,
  }, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
