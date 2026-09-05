import { writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createAgentExecutionPort } from "../connectors/http-agent-node/index.mjs";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const PRIVATE_MATERIAL = /(password|secret|token|cookie|credential|private reasoning|session id|thread id)/i;
const pause = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

export function createLocalCodexHttpAdmissionRecord(observations, capabilities, recordedAt = new Date().toISOString()) {
  const statuses = observations.map(({ status }) => status);
  const completed = observations.findLast(({ status }) => TERMINAL.has(status));
  if (completed?.status !== "COMPLETED" || !completed.resultReference || !completed.evidenceOutputs?.length ||
      !completed.usageOutputs?.length || !statuses.includes("AWAITING_APPROVAL") ||
      statuses.filter((status) => status === "WORKING").length < 2 ||
      PRIVATE_MATERIAL.test(observations.map(({ summary }) => summary).join("\n"))) {
    throw new Error("LOCAL_CODEX_HTTP_ADMISSION_INCOMPLETE");
  }
  return { schemaVersion: 1, recordType: "COMPANY_OS_LOCAL_CODEX_HTTP_ADMISSION",
    recordedAt, connector: { connectorId: capabilities.connectorId,
      protocolVersion: capabilities.protocolVersion, health: "HEALTHY", authentication: "FILE_INJECTED_BEARER" },
    execution: { sandbox: "read-only", syntheticInput: true, sideEffectsAllowed: false,
      observedStatuses: statuses, pauseConfirmed: true,
      approvalReference: "approval-local-alpha", resumeConfirmed: true, outcome: "PASS" },
    evidence: { resultReference: completed.resultReference,
      resultDigest: completed.evidenceOutputs.find(({ evidenceReference }) => evidenceReference === completed.resultReference)?.contentDigest,
      usage: completed.usageOutputs[0] },
    notClaimed: ["customer staging acceptance", "production acceptance", "enterprise data access"] };
}

function outputPath(argv) {
  const index = argv.indexOf("--output");
  if (index < 0 || !argv[index + 1]) return null;
  const root = resolve("docs/acceptance/alpha");
  const target = resolve(argv[index + 1]);
  if (!target.startsWith(`${root}${sep}`) || !target.endsWith(".json")) throw new Error("LOCAL_CODEX_HTTP_OUTPUT_INVALID");
  return target;
}

async function waitFor(connector, workId, predicate, timeoutMilliseconds = 300_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const observations = await connector.observe(workId);
    if (predicate(observations)) return observations;
    await pause(500);
  }
  throw new Error("LOCAL_CODEX_HTTP_ADMISSION_TIMEOUT");
}

export async function runLocalCodexHttpAdmission(environment = process.env) {
  const connector = createAgentExecutionPort(undefined, environment);
  if (await connector.health() !== "HEALTHY") throw new Error("LOCAL_CODEX_HTTP_NODE_UNHEALTHY");
  const capabilities = await connector.capabilities();
  if (!capabilities.supportsPause || !capabilities.supportsResume || !capabilities.supportsEvidence) {
    throw new Error("LOCAL_CODEX_HTTP_CAPABILITY_INCOMPLETE");
  }
  const inspectedWorkId = environment.COMPANY_OS_LOCAL_CODEX_HTTP_INSPECT_WORK_ID?.trim();
  const workId = inspectedWorkId || `local-codex-http-${Date.now().toString(36)}`;
  const agentId = "local-codex-http-agent";
  let observations;
  if (inspectedWorkId) {
    observations = await connector.observe(workId);
  } else {
    const deployment = await connector.deploy({ id: agentId, companyId: "local-company",
      displayName: "Local Codex HTTP Agent", runtimeConnectorId: capabilities.connectorId,
      accountableHumanId: "local-human", role: "Synthetic read-only verifier", autonomyLevel: 1 });
    const now = new Date();
    const request = { id: workId, companyId: "local-company", agentId, requestedBy: "local-human",
      goal: "Verify the authenticated Company OS HTTP Agent Node pause, exact approval resume, and evidence boundary using synthetic non-production input.",
      input: { actionReferences: ["verify-read-only-http-boundary"], permissionReferences: [],
        dataAuthorizationReferences: [], responsibilityContractId: "local-contract", responsibilityContractRevision: 1 },
      idempotencyKey: `${workId}-v1`, timeoutAt: new Date(now.getTime() + 300_000).toISOString() };
    const proof = { proofId: "local-proof", connectorId: capabilities.connectorId, issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 300_000).toISOString(), digest: `sha256:${"0".repeat(64)}` };
    await connector.submit(deployment, request, proof);
    await waitFor(connector, workId, (rows) => rows.some(({ status }) => status === "WORKING"));
    await connector.pause(workId, "Require an exact accountable-human checkpoint");
    await waitFor(connector, workId, (rows) => rows.some(({ status }) => status === "AWAITING_APPROVAL"));
    await connector.resume(workId, "approval-local-alpha");
    observations = await waitFor(connector, workId, (rows) => rows.some(({ status }) => TERMINAL.has(status)));
  }
  return createLocalCodexHttpAdmissionRecord(observations, capabilities);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    const record = await runLocalCodexHttpAdmission();
    const encoded = `${JSON.stringify(record, null, 2)}\n`;
    const target = outputPath(process.argv.slice(2));
    if (target) await writeFile(target, encoded, { encoding: "utf8", mode: 0o600 });
    process.stdout.write(encoded);
  } catch (error) {
    const code = error instanceof Error && /^LOCAL_CODEX_HTTP_[A-Z0-9_]+$/.test(error.message)
      ? error.message : "LOCAL_CODEX_HTTP_ADMISSION_FAILED";
    process.stderr.write(`${code}\n`); process.exitCode = 1;
  }
}
