import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[a-z0-9.-]+)?$/;
const IMAGE = /@sha256:[a-f0-9]{64}$/;

const stagingSteps = [
  {
    id: "read-only-boundary-preflight",
    evidenceKey: "boundaryPreflight",
    ownerRole: "acceptance",
    authorization: "READ_ONLY",
    command: "npm run ops:preflight:customer-boundaries",
  },
  { id: "enterprise-browser-identity", evidenceKey: "browserIdentity", ownerRole: "identity" },
  { id: "responsibility-contract", evidenceKey: "responsibilityContract", ownerRole: "acceptance" },
  { id: "agent-execution", evidenceKey: "agentExecution", ownerRole: "agentRuntime" },
  { id: "model-execution", evidenceKey: "modelExecution", ownerRole: "modelGovernance" },
  { id: "data-boundary", evidenceKey: "dataBoundary", ownerRole: "dataGovernance" },
  { id: "secret-lifecycle", evidenceKey: "secretLifecycle", ownerRole: "secretManagement" },
  { id: "idempotency-replay", evidenceKey: "idempotency", ownerRole: "acceptance" },
  { id: "restart-recovery", evidenceKey: "restartRecovery", ownerRole: "backupRecovery" },
];

const productionSteps = [
  ["approved-change-record", "changeRecord", "acceptance"],
  ["certificate-chain", "certificateChain", "identity"],
  ["network-policy", "networkPolicy", "acceptance"],
  ["rotation-ownership", "rotationOwnership", "secretManagement"],
  ["session-policy", "sessionPolicy", "identity"],
  ["offsite-backup-destination", "backupDestination", "backupRecovery"],
  ["retention-policy", "retentionPolicy", "backupRecovery"],
  ["monitoring-route", "monitoringRoute", "incidentResponse"],
  ["incident-contacts", "incidentContacts", "incidentResponse"],
  ["rollback-window", "rollbackWindow", "backupRecovery"],
  ["legal-hold-policy", "legalHoldPolicy", "backupRecovery"],
];

function release(manifest, manifestDigest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
      manifest.schemaVersion !== 1 || manifest.product !== "company-os" ||
      typeof manifest.releaseVersion !== "string" || !VERSION.test(manifest.releaseVersion) ||
      typeof manifest.sourceRevision !== "string" || !REVISION.test(manifest.sourceRevision) ||
      !SHA256.test(manifestDigest) || !manifest.images || typeof manifest.images !== "object" ||
      ![manifest.images.api, manifest.images.web, manifest.images.ops, manifest.images.codexAgentNode,
        manifest.images.vaultSecretBroker]
        .every((value) => typeof value === "string" && IMAGE.test(value))) {
    throw new Error("ACCEPTANCE_PLAN_RELEASE_INVALID");
  }
  return {
    version: manifest.releaseVersion,
    sourceRevision: manifest.sourceRevision,
    manifestDigest,
    imageDigests: {
      api: `sha256:${manifest.images.api.split("@sha256:")[1]}`,
      web: `sha256:${manifest.images.web.split("@sha256:")[1]}`,
      ops: `sha256:${manifest.images.ops.split("@sha256:")[1]}`,
      codexAgentNode: `sha256:${manifest.images.codexAgentNode.split("@sha256:")[1]}`,
      vaultSecretBroker: `sha256:${manifest.images.vaultSecretBroker.split("@sha256:")[1]}`,
    },
  };
}

/**
 * Creates a coordinate-free execution plan. It deliberately does not accept
 * evidence digests or owner identities, so a plan can never be mistaken for
 * the separately validated customer acceptance record.
 */
export function createCustomerAcceptancePlan(manifest, scope, manifestDigest) {
  if (scope !== "CUSTOMER_STAGING" && scope !== "PRODUCTION") {
    throw new Error("ACCEPTANCE_PLAN_SCOPE_INVALID");
  }
  const steps = stagingSteps.map((step) => ({
    ...step,
    authorization: step.authorization ?? "CUSTOMER_STAGING_REQUIRED",
    command: step.command ?? null,
  }));
  if (scope === "PRODUCTION") {
    steps.push(...productionSteps.map(([id, evidenceKey, ownerRole]) => ({
      id,
      evidenceKey,
      ownerRole,
      authorization: "PRODUCTION_CHANGE_REQUIRED",
      command: null,
    })));
  }
  return {
    schemaVersion: 1,
    status: "PLANNED_NOT_EXECUTED",
    scope,
    release: release(manifest, manifestDigest),
    requiredOwnerRoles: [
      "acceptance", "identity", "agentRuntime", "modelGovernance", "dataGovernance",
      "secretManagement", "backupRecovery", "incidentResponse",
    ],
    requiredEvidenceKeys: steps.map(({ evidenceKey }) => evidenceKey),
    steps,
    completion: {
      independentlyVerified: false,
      externalEvidenceRequired: true,
      recordValidationCommand: "npm run ops:validate:customer-acceptance -- <acceptance-record.json>",
    },
  };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [manifestPath, scope = "CUSTOMER_STAGING"] = process.argv.slice(2);
  if (!manifestPath) throw new Error("USAGE_RELEASE_MANIFEST_PATH_REQUIRED");
  const source = await readFile(manifestPath);
  let manifest;
  try { manifest = JSON.parse(source.toString("utf8")); } catch { throw new Error("ACCEPTANCE_PLAN_RELEASE_INVALID"); }
  const manifestDigest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
  process.stdout.write(`${JSON.stringify(createCustomerAcceptancePlan(manifest, scope, manifestDigest), null, 2)}\n`);
}
