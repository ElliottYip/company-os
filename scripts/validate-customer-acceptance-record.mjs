import { readFile } from "node:fs/promises";

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[a-z0-9.-]+)?$/;
const forbiddenKey = /(password|secret|token|cookie|email|url|hostname|subject|credential|personal|raw)/i;
const allowedGovernanceKeys = new Set(["secretLifecycle", "secretManagement"]);
const stagingEvidence = [
  "boundaryPreflight", "browserIdentity", "responsibilityContract", "agentExecution",
  "modelExecution", "dataBoundary", "secretLifecycle", "idempotency", "restartRecovery",
];
const productionEvidence = [
  "changeRecord", "certificateChain", "networkPolicy", "rotationOwnership",
  "sessionPolicy", "backupDestination", "retentionPolicy", "monitoringRoute",
  "incidentContacts", "rollbackWindow", "legalHoldPolicy",
];
const ownerKeys = [
  "acceptance", "identity", "agentRuntime", "modelGovernance", "dataGovernance", "secretManagement",
  "backupRecovery", "incidentResponse",
];

const fail = (code) => { throw new Error(code); };
const object = (value, code) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
};
const exactKeys = (value, allowed, code) => {
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) fail(code);
};
const text = (value, pattern, code) => {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
};

const assertCoordinateFree = (value, path = "record") => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCoordinateFree(item, `${path}.${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key) && !allowedGovernanceKeys.has(key)) fail("ACCEPTANCE_RECORD_FORBIDDEN_FIELD");
    if (typeof child === "string" && (child.includes("://") || child.includes("@"))) {
      fail("ACCEPTANCE_RECORD_CUSTOMER_COORDINATE_FORBIDDEN");
    }
    assertCoordinateFree(child, `${path}.${key}`);
  }
};

const validateEvidence = (value, keys, code) => {
  const evidence = object(value, code);
  exactKeys(evidence, keys, code);
  for (const key of keys) text(evidence[key], SHA256, code);
  return evidence;
};

export function validateCustomerAcceptanceRecord(value) {
  const record = object(value, "ACCEPTANCE_RECORD_INVALID");
  assertCoordinateFree(record);
  exactKeys(record, [
    "schemaVersion", "recordId", "scope", "release", "owners", "stagingEvidence",
    "productionEvidence", "approvedAt", "approvalEvidenceDigest",
  ], "ACCEPTANCE_RECORD_FIELDS_INVALID");
  if (record.schemaVersion !== 2 || !["CUSTOMER_STAGING", "PRODUCTION"].includes(record.scope)) {
    fail("ACCEPTANCE_RECORD_CONTRACT_INVALID");
  }
  text(record.recordId, OPAQUE_ID, "ACCEPTANCE_RECORD_ID_INVALID");
  const release = object(record.release, "ACCEPTANCE_RELEASE_INVALID");
  exactKeys(release, ["version", "sourceRevision", "manifestDigest"], "ACCEPTANCE_RELEASE_INVALID");
  text(release.version, VERSION, "ACCEPTANCE_RELEASE_VERSION_INVALID");
  text(release.sourceRevision, REVISION, "ACCEPTANCE_RELEASE_REVISION_INVALID");
  text(release.manifestDigest, SHA256, "ACCEPTANCE_RELEASE_DIGEST_INVALID");
  const owners = object(record.owners, "ACCEPTANCE_OWNERS_INVALID");
  exactKeys(owners, ownerKeys, "ACCEPTANCE_OWNERS_INVALID");
  for (const key of ownerKeys) text(owners[key], OPAQUE_ID, "ACCEPTANCE_OWNER_ID_INVALID");
  validateEvidence(record.stagingEvidence, stagingEvidence, "ACCEPTANCE_STAGING_EVIDENCE_INVALID");
  if (record.scope === "PRODUCTION") {
    validateEvidence(record.productionEvidence, productionEvidence, "ACCEPTANCE_PRODUCTION_EVIDENCE_INVALID");
  } else if (record.productionEvidence !== null) {
    fail("ACCEPTANCE_STAGING_PRODUCTION_EVIDENCE_MUST_BE_NULL");
  }
  if (typeof record.approvedAt !== "string" || !Number.isFinite(Date.parse(record.approvedAt))) {
    fail("ACCEPTANCE_APPROVAL_TIME_INVALID");
  }
  text(record.approvalEvidenceDigest, SHA256, "ACCEPTANCE_APPROVAL_EVIDENCE_INVALID");
  return {
    schemaVersion: 2,
    status: "RECORD_STRUCTURALLY_VALID",
    scope: record.scope,
    releaseVersion: release.version,
    recordId: record.recordId,
    independentlyVerified: false,
    externalEvidenceRequired: true,
  };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [path] = process.argv.slice(2);
  if (!path) fail("USAGE_ACCEPTANCE_RECORD_PATH_REQUIRED");
  const record = JSON.parse(await readFile(path, "utf8"));
  process.stdout.write(`${JSON.stringify(validateCustomerAcceptanceRecord(record), null, 2)}\n`);
}
