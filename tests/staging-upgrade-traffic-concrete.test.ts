import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderStagingUpgradeCandidateDependencies } from
  "../adapters/config/staging-upgrade-candidate-dependencies.ts";
import { renderStagingUpgradeCandidateEnvironment } from
  "../adapters/config/staging-upgrade-candidate-environment.ts";
import { executeStagingUpgradeTraffic } from "../scripts/execute-staging-upgrade-traffic.ts";

const d = (value: string) => `sha256:${value.repeat(64)}`;
const image = (name: string, value: string) => `ghcr.io/example/${name}@sha256:${value.repeat(64)}`;
const operationId = "upgrade-rc4-to-rc5"; const siteId = "company-os-hong-kong";
const activeId = `0.1.0-rc.4-${"a".repeat(12)}`; const candidateId = `0.1.0-rc.5-${"b".repeat(12)}`;
const snapshot = { queuedAttempts: 0, runningAttempts: 0, waitingApprovalAttempts: 0,
  recoverableAttempts: 2, cancelledAttempts: 1, succeededAttempts: 5, failedAttempts: 1,
  approvalRecords: 3, evidenceRecords: 9 };
function runtime() { return { schemaVersion: 1, product: "company-os", environment: "STAGING", operationId, siteId,
  active: { releaseId: activeId, composeProject: "company-os-active", productNetwork: "company-os-active",
    ports: { api: 4601, web: 4600, referenceDataNode: 4322 } },
  candidate: { releaseId: candidateId, composeProject: "company-os-candidate", productNetwork: "company-os-candidate",
    ports: { api: 14601, web: 14600, referenceDataNode: 14322 }, serviceIds: { api: "api-candidate",
      web: "web-candidate", secretBroker: "broker-candidate", agentNode: "agent-candidate",
      dataNode: "data-candidate" }, parallelDatabaseReference: "database:candidate",
    secretProjectionReference: "secret:candidate", ingressRouteReference: "route:active",
    resourceBudget: { maximumMemoryBytes: 2_684_354_560, maximumCpu: 2.5, maximumPids: 640,
      requiredHostHeadroomBytes: 1_073_741_824 }, images: { api: image("api", "1"), web: image("web", "2"),
      ops: image("ops", "3"), codexAgentNode: image("agent", "4"), vaultSecretBroker: image("broker", "5"),
      referenceDataNode: image("data", "6") } } }; }
function route() { return { schemaVersion: 1, product: "company-os", environment: "STAGING", siteId,
  routeReference: "route:active", observation: { sampleCount: 3, intervalMilliseconds: 0,
    maximumP95Milliseconds: 100, maximumFailures: 0 }, router: { image: image("caddy", "7"),
    composeProject: "company-os-router", containerId: "company-os-router", network: "company-os-router",
    stablePorts: { web: 4700, api: 4701 }, internalPorts: { web: 8080, api: 8081, admin: 2019 },
    hostGatewayAlias: "host.docker.internal", resourceBudget: { maximumMemoryBytes: 67_108_864,
      maximumCpu: 0.1, maximumPids: 32 } } }; }
const sha256 = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function authorization(startupStateDigest = d("2")) { return { schemaVersion: 1, product: "company-os", environment: "STAGING",
  operation: { id: operationId, siteId, accountableOperatorReference: "human:release-owner",
    expiresAt: "2026-08-28T00:00:00.000Z" }, active: { releaseId: activeId,
    sourceRevision: "a".repeat(40), releaseManifestDigest: d("1"), startupStateDigest },
  candidate: { releaseId: candidateId, sourceRevision: "b".repeat(40), releaseManifestDigest: d("3"),
    siteContractDigest: d("4"), runtimeContractDigest: d("5") },
  cutover: { planId: "cutover-0123456789abcdef01234567", planDigest: d("6") },
  authorization: { preparation: "change:prepare", trafficCutover: "change:traffic", rollback: "change:rollback" } }; }
function preparation() { return { schemaVersion: 1, product: "company-os", phase: "UPGRADE_PREPARATION",
  status: "UPGRADE_PREPARATION_COMPLETE_NOT_ROUTED", operationId, siteId,
  authorizationReference: "change:prepare", trafficMoved: false, automaticRollbackAttempted: false,
  active: { releaseId: activeId }, candidate: { releaseId: candidateId },
  cutover: { planId: "cutover-0123456789abcdef01234567" },
  nextPhase: { authorizationReference: "change:traffic" },
  rollback: { strategy: "RESTORE_PAIRED_BACKUP_TO_EMPTY_PARALLEL_DATABASE" } }; }
function routerInspection(root: string) { return JSON.stringify([{ Config: { Image: route().router.image },
  State: { Running: true }, HostConfig: { ReadonlyRootfs: true, CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges:true"], ExtraHosts: ["host.docker.internal:host-gateway"],
    PortBindings: { "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "4700" }],
      "8081/tcp": [{ HostIp: "127.0.0.1", HostPort: "4701" }] } },
  NetworkSettings: { Networks: { "company-os-router": {} } },
  Mounts: [{ Type: "bind", Source: root, Destination: "/etc/company-os-route", RW: false }] }]); }
function activeEnvironment() { return [
  `COMPANY_OS_API_IMAGE=${image("api", "a")}`, `COMPANY_OS_WEB_IMAGE=${image("web", "a")}`,
  `COMPANY_OS_OPS_IMAGE=${image("ops", "a")}`, `COMPANY_OS_REFERENCE_DATA_NODE_IMAGE=${image("data", "a")}`,
  "COMPANY_OS_COMPOSE_PROJECT=company-os-active", "COMPANY_OS_PRODUCT_NETWORK=company-os-active",
  "COMPANY_OS_REFERENCE_DATA_NODE_PORT=4322", "COMPANY_OS_WEB_LOOPBACK_PORT=4600",
  "COMPANY_OS_API_LOOPBACK_PORT=4601", "COMPANY_OS_PUBLIC_URL=https://api.company-os.example",
  "COMPANY_OS_WEB_ORIGINS=https://company-os.example",
  "COMPANY_OS_OIDC_REDIRECT_URI=https://company-os.example/api/auth/oauth2/callback/enterprise-oidc",
  "COMPANY_OS_INSTANCE_ID=company-os-hong-kong", "COMPANY_OS_OIDC_ISSUER=https://identity.company-os.example",
  "COMPANY_OS_OIDC_DISCOVERY_URL=https://identity.company-os.example/.well-known/openid-configuration",
  "COMPANY_OS_OIDC_CLIENT_ID=company-os-staging", "COMPANY_OS_TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128",
  "COMPANY_OS_RETENTION_POLICY_ID=standard-retention",
  "COMPANY_OS_ACCOUNTABILITY_EXPORT_POLICY_ID=standard-accountability-export",
  "COMPANY_OS_HTTP_AGENT_NODE_ID=agent-active", "COMPANY_OS_HTTP_AGENT_NODE_NAME=Active Agent",
  "COMPANY_OS_HTTP_AGENT_NODE_BASE_URL=https://agent-active.internal",
  "COMPANY_OS_HTTP_DATA_NODE_ID=data-active", "COMPANY_OS_HTTP_DATA_NODE_NAME=Active Data",
  "COMPANY_OS_HTTP_DATA_NODE_BASE_URL=https://data-active.internal",
  "COMPANY_OS_HTTP_SECRET_BROKER_ID=broker-active", "COMPANY_OS_HTTP_SECRET_BROKER_NAME=Active Broker",
  "COMPANY_OS_HTTP_SECRET_BROKER_BASE_URL=https://broker-active.internal",
  "COMPANY_OS_HTTP_DATA_NODE_SOURCES=acceptance-fixtures", "COMPANY_OS_HTTP_DATA_NODE_OPERATIONS=READ",
  "COMPANY_OS_OFF_SITE_BACKUP=DISABLED_PENDING_AUTHORIZATION", "COMPANY_OS_PUBLIC_INGRESS=ENABLED",
  "COMPANY_OS_SECRET_DIRECTORY=/etc/company-os/secrets", "",
].join("\n"); }
function activeDependencies(root: string) { return { schemaVersion: 1, environment: "STAGING",
  deploymentId: "company-os-hong-kong", ingress: { webOrigin: "https://company-os.example",
    apiOrigin: "https://api.company-os.example", ownerReference: "team:infra",
    dnsEvidenceReference: "evidence:dns-01", tlsEvidenceReference: "evidence:tls-01" },
  isolation: { deploymentRoot: root, composeProject: "company-os-active", network: "company-os-active",
    webLoopbackPort: 4600, apiLoopbackPort: 4601 }, postgres: { majorVersion: 16, ownership: "DEDICATED",
    tlsMode: "VERIFY_FULL", coordinateSource: "SECRET_FILES", ownerReference: "team:database",
    evidenceReference: "evidence:postgres-01" }, oidc: { issuer: "https://identity.company-os.example",
    discoveryUrl: "https://identity.company-os.example/.well-known/openid-configuration",
    clientId: "company-os-staging", ownership: "PRODUCT_SCOPED_CLIENT", pkce: "S256",
    ownerReference: "team:identity", evidenceReference: "evidence:oidc-01" },
  vaultBroker: { baseUrl: "https://vault.company-os.example", ownership: "DEDICATED",
    ownerReference: "team:vault", evidenceReference: "evidence:vault-01" },
  agentNode: { baseUrl: "https://agent.company-os.example", ownership: "DEDICATED",
    ownerReference: "team:agent", evidenceReference: "evidence:agent-01" },
  dataNode: { baseUrl: "https://data.company-os.example", ownership: "DEDICATED",
    ownerReference: "team:data", evidenceReference: "evidence:data-01" },
  backup: { provider: "ZOS_S3_COMPATIBLE", endpoint: "https://hangzhou7.zos.ctyun.cn", region: "us-east-1",
    bucket: "company-os-staging-backup", ownership: "DEDICATED", versioning: true, objectLock: "DISABLED",
    credentialSource: "VAULT_RENDERED_FILES", ownerReference: "team:backup",
    evidenceReference: "evidence:backup-01" } }; }

test("concrete traffic command composes hardened routing and bounded observation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "company-os-traffic-concrete-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, "candidate"); const routes = join(root, "routes");
  await mkdir(join(candidate, "step-evidence"), { recursive: true, mode: 0o700 }); await mkdir(routes, { mode: 0o700 });
  const activeReleaseDirectory = join(root, "releases", activeId);
  const candidateReleaseDirectory = join(root, "releases", candidateId);
  const siteContractDirectory = join(root, "site-contracts", siteId, candidateId);
  await mkdir(activeReleaseDirectory, { recursive: true, mode: 0o700 });
  await mkdir(candidateReleaseDirectory, { recursive: true, mode: 0o700 });
  await mkdir(siteContractDirectory, { recursive: true, mode: 0o700 });
  const activeDependencyRaw = `${JSON.stringify(activeDependencies(root), null, 2)}\n`;
  const dependencyRaw = renderStagingUpgradeCandidateDependencies(runtime(), activeDependencyRaw);
  const startupRaw = `${JSON.stringify({ schemaVersion: 1, product: "company-os", releaseId: activeId,
    releaseVersion: "0.1.0-rc.4", sourceRevision: "a".repeat(40), dependencyManifestDigest: d("9"),
    state: "STARTED_NOT_ACCEPTED", acceptanceClaimed: false })}\n`;
  const candidateEnvironment = renderStagingUpgradeCandidateEnvironment(runtime(), activeEnvironment(),
    "/etc/company-os/candidate-secrets", candidate, "https://vault.company-os.internal");
  const files = { authorization: join(root, "authorization.json"), runtime: join(root, "runtime.json"),
    route: join(root, "route.json") };
  await Promise.all([
    writeFile(files.authorization, `${JSON.stringify(authorization(sha256(startupRaw)))}\n`, { mode: 0o600 }),
    writeFile(files.runtime, `${JSON.stringify(runtime())}\n`, { mode: 0o600 }),
    writeFile(files.route, `${JSON.stringify(route())}\n`, { mode: 0o600 }),
    writeFile(join(root, "upgrade-preparation-state.json"), `${JSON.stringify(preparation(), null, 2)}\n`, { mode: 0o600 }),
    writeFile(join(root, "startup-state.json"), startupRaw, { mode: 0o600 }),
    writeFile(join(candidate, "candidate.env"), candidateEnvironment, { mode: 0o600 }),
    writeFile(join(candidate, "staging-dependencies.json"), dependencyRaw, { mode: 0o600 }),
    writeFile(join(siteContractDirectory, "staging-dependencies.json"), activeDependencyRaw, { mode: 0o600 }),
    writeFile(join(root, "release-store.json"), `${JSON.stringify({ schemaVersion: 2, product: "company-os",
      state: "PREPARED_NOT_STARTED", prepared: { releaseId: candidateId, releaseVersion: "0.1.0-rc.5",
        sourceRevision: "b".repeat(40), bundleManifestDigest: d("7"), releaseDirectory: candidateReleaseDirectory,
        siteContract: { schemaVersion: 1, siteId, releaseId: candidateId,
          dependencyManifestDigest: d("0"), contractDirectory: siteContractDirectory,
          digests: { "dependency-secrets.json": d("1"), "site-runtime.json": d("2"),
            "staging-dependencies.json": d("3"), "staging.env": d("4") } } },
      previous: [{ releaseId: activeId, releaseVersion: "0.1.0-rc.4", sourceRevision: "a".repeat(40),
        bundleManifestDigest: d("8"), releaseDirectory: activeReleaseDirectory }] })}\n`, { mode: 0o600 }),
    writeFile(join(candidate, "step-evidence", "state-comparison.json"), `${JSON.stringify({ schemaVersion: 1,
      product: "company-os", operationId, siteId, candidateReleaseId: candidateId, step: "state-comparison",
      outcome: "CONTROL_TOTALS_AND_RESPONSIBILITY_EVIDENCE_MATCHED", exactSourceDigest: d("a"), snapshot,
      customerRecordsIncluded: false, secretMaterialIncluded: false })}\n`, { mode: 0o600 }),
  ]);
  let monotonic = 0;
  const result = await executeStagingUpgradeTraffic({ rootDirectory: root, candidateDirectory: candidate,
    routeDirectory: routes, authorizationFile: files.authorization, authorizationReference: "change:traffic",
    runtimeContractFile: files.runtime, routeContractFile: files.route,
    now: "2026-08-27T12:00:00.000Z" }, {
    runCommand: async (argv) => argv[1] === "inspect" ? { status: 0, stdout: routerInspection(routes) } :
      { status: 0, stdout: "" },
    fetch: async () => new Response("ok", { status: 200,
      headers: { "x-company-os-release-id": candidateId } }),
    inspectCandidate: async () => ({ schemaVersion: 1 as const, status: "DRAINED" as const,
      restartAllowed: true, blockers: [], exactSourceDigest: d("a"), snapshot }),
    wait: async () => {}, monotonicNow: () => { monotonic += 10; return monotonic; },
    clock: () => "2026-08-27T12:01:00.000Z",
  });
  assert.equal(result.status, "UPGRADE_OBSERVATION_COMPLETE_PENDING_ACCEPTANCE");
  assert.equal(result.completedEvidence.length, 3);
  assert.equal(JSON.parse(await readFile(join(root, "upgrade-traffic-state.json"), "utf8")).trafficMoved, true);
  const active = JSON.parse(await readFile(join(root, "startup-state.json"), "utf8"));
  assert.equal(active.releaseId, candidateId); assert.equal(active.activation.kind, "UPGRADE");
  assert.equal(active.acceptanceClaimed, false);
});
