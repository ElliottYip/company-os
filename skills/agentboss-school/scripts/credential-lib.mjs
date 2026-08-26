import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export const CREDENTIAL_TYPE = "AGENT_BOSS_FOUNDATIONS";
export const CREDENTIAL_NAME = Object.freeze({
  zh: "Agent Boss 基础能力证书",
  en: "Agent Boss Foundations Certificate",
});
export const CREDENTIAL_DISCLAIMER = "Issuer-reviewed course credential; not a degree, government qualification, regulated professional license, or authorization to provide professional services.";

const CAPABLE_LEVELS = new Set(["capable", "strong"]);
const ALL_LEVELS = new Set(["unknown", "developing", "capable", "strong"]);
const HANDLE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const COHORT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const KEY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CREDENTIAL_ID = /^ABS-FND-\d{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FOUNDATIONS_NODES = Object.freeze([
  "role/not-a-prompt-engineer",
  "role/delegation-fit",
  "role/outcome-contract",
  "governance/exact-action-approval",
  "shared/demo-responsibility-loop",
]);
const SECRET_MATERIAL = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*\S+/i;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validDateTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function boundedString(value, minimum, maximum) {
  return typeof value === "string" && [...value].length >= minimum && [...value].length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function validateCompletionSubmission(submission, manifest) {
  const errors = [];
  const topKeys = new Set(["schemaVersion", "credentialType", "courseVersion", "cohort", "holder", "completion", "assessment"]);
  if (!hasExactKeys(submission, topKeys)) return ["submission must contain exactly the v1 top-level fields"];
  if (submission.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (submission.credentialType !== CREDENTIAL_TYPE) errors.push(`credentialType must be ${CREDENTIAL_TYPE}`);
  if (submission.courseVersion !== manifest.version) errors.push(`courseVersion must be ${manifest.version}`);
  if (typeof submission.cohort !== "string" || !COHORT.test(submission.cohort)) errors.push("cohort is invalid");

  const holder = submission.holder;
  if (!hasExactKeys(holder, new Set(["publicName", "publicHandle", "profileUrl", "yearbookConsent"]))) {
    errors.push("holder must contain exactly publicName, publicHandle, profileUrl and yearbookConsent");
  } else {
    if (!boundedString(holder.publicName, 1, 80)) errors.push("holder.publicName must contain 1-80 printable characters");
    if (holder.publicHandle !== null && (typeof holder.publicHandle !== "string" || !HANDLE.test(holder.publicHandle))) errors.push("holder.publicHandle is invalid");
    if (holder.profileUrl !== null && (typeof holder.profileUrl !== "string" || !/^https:\/\//.test(holder.profileUrl) || holder.profileUrl.length > 500)) errors.push("holder.profileUrl must be null or an HTTPS URL");
    if (typeof holder.yearbookConsent !== "boolean") errors.push("holder.yearbookConsent must be boolean");
  }

  const completion = submission.completion;
  if (!hasExactKeys(completion, new Set(["completedNodes", "labNode", "labLevel", "competencies"]))) {
    errors.push("completion must contain exactly completedNodes, labNode, labLevel and competencies");
  } else {
    const knownNodes = new Set(manifest.nodes.map(({ id }) => id));
    if (!Array.isArray(completion.completedNodes) || new Set(completion.completedNodes).size !== completion.completedNodes.length) {
      errors.push("completion.completedNodes must be a unique array");
    } else {
      for (const node of completion.completedNodes) if (!knownNodes.has(node)) errors.push(`completion has unknown node: ${node}`);
      for (const required of manifest.defaultPath) if (!completion.completedNodes.includes(required)) errors.push(`completion is missing required node: ${required}`);
    }
    if (completion.labNode !== "shared/demo-responsibility-loop") errors.push("completion.labNode is invalid");
    if (!CAPABLE_LEVELS.has(completion.labLevel)) errors.push("completion.labLevel must be capable or strong");
    const competencies = completion.competencies;
    if (!hasExactKeys(competencies, new Set(["delegation", "operations", "governance", "teamAdoption"]))) {
      errors.push("completion.competencies has invalid fields");
    } else {
      for (const key of ["delegation", "operations", "governance"]) {
        if (!CAPABLE_LEVELS.has(competencies[key])) errors.push(`completion.competencies.${key} must be capable or strong`);
      }
      if (!ALL_LEVELS.has(competencies.teamAdoption)) errors.push("completion.competencies.teamAdoption is invalid");
    }
  }

  const assessment = submission.assessment;
  if (!hasExactKeys(assessment, new Set(["method", "reviewerRole", "reviewedAt", "evidenceSummary", "evidenceReferences"]))) {
    errors.push("assessment has invalid fields");
  } else {
    if (assessment.method !== "ISSUER_REVIEW") errors.push("assessment.method must be ISSUER_REVIEW");
    if (!boundedString(assessment.reviewerRole, 1, 120)) errors.push("assessment.reviewerRole is invalid");
    if (!validDate(assessment.reviewedAt)) errors.push("assessment.reviewedAt must be YYYY-MM-DD");
    if (!boundedString(assessment.evidenceSummary, 1, 1000) || SECRET_MATERIAL.test(assessment.evidenceSummary)) errors.push("assessment.evidenceSummary is invalid or sensitive");
    if (!Array.isArray(assessment.evidenceReferences) || assessment.evidenceReferences.length > 20) {
      errors.push("assessment.evidenceReferences must contain 0-20 entries");
    } else {
      for (const reference of assessment.evidenceReferences) {
        if (typeof reference !== "string" || reference.length > 500 || (!isAbsolute(reference) && !/^https:\/\//.test(reference))) errors.push("assessment evidence references must be absolute paths or HTTPS URLs");
      }
    }
  }
  return errors;
}

export function validateIssuerKeyring(keyring) {
  const errors = [];
  if (!hasExactKeys(keyring, new Set(["schemaVersion", "keys"]))) return ["issuer keyring has invalid top-level fields"];
  if (keyring.schemaVersion !== 1) errors.push("issuer keyring schemaVersion must be 1");
  if (!Array.isArray(keyring.keys)) return [...errors, "issuer keyring keys must be an array"];
  const ids = new Set();
  for (const [index, key] of keyring.keys.entries()) {
    const label = `keys[${index}]`;
    if (!hasExactKeys(key, new Set(["keyId", "algorithm", "publicKeyPem", "status", "validFrom", "validUntil"]))) {
      errors.push(`${label} has invalid fields`);
      continue;
    }
    if (typeof key.keyId !== "string" || !KEY_ID.test(key.keyId)) errors.push(`${label}.keyId is invalid`);
    if (ids.has(key.keyId)) errors.push(`${label}.keyId is duplicated`);
    ids.add(key.keyId);
    if (key.algorithm !== "Ed25519") errors.push(`${label}.algorithm must be Ed25519`);
    if (typeof key.publicKeyPem !== "string" || key.publicKeyPem.length > 1000 || !key.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
      errors.push(`${label}.publicKeyPem is invalid`);
    } else {
      try {
        if (createPublicKey(key.publicKeyPem).asymmetricKeyType !== "ed25519") errors.push(`${label}.publicKeyPem must contain an Ed25519 public key`);
      } catch {
        errors.push(`${label}.publicKeyPem is invalid`);
      }
    }
    if (!new Set(["ACTIVE", "RETIRED", "REVOKED"]).has(key.status)) errors.push(`${label}.status is invalid`);
    if (!validDate(key.validFrom)) errors.push(`${label}.validFrom is invalid`);
    if (key.validUntil !== null && !validDate(key.validUntil)) errors.push(`${label}.validUntil is invalid`);
  }
  return errors;
}

export function validateRevocations(value) {
  const errors = [];
  if (!hasExactKeys(value, new Set(["schemaVersion", "revocations"]))) return ["revocations has invalid top-level fields"];
  if (value.schemaVersion !== 1) errors.push("revocations schemaVersion must be 1");
  if (!Array.isArray(value.revocations)) return [...errors, "revocations must be an array"];
  const ids = new Set();
  for (const [index, revocation] of value.revocations.entries()) {
    if (!hasExactKeys(revocation, new Set(["credentialId", "revokedAt", "reasonCode", "publicNote"]))) {
      errors.push(`revocations[${index}] has invalid fields`);
      continue;
    }
    if (typeof revocation.credentialId !== "string" || !CREDENTIAL_ID.test(revocation.credentialId)) errors.push(`revocations[${index}].credentialId is invalid`);
    if (ids.has(revocation.credentialId)) errors.push(`revocations[${index}].credentialId is duplicated`);
    ids.add(revocation.credentialId);
    if (!validDateTime(revocation.revokedAt)) errors.push(`revocations[${index}].revokedAt is invalid`);
    if (!boundedString(revocation.reasonCode, 1, 64) || !/^[A-Z][A-Z0-9_]*$/.test(revocation.reasonCode)) errors.push(`revocations[${index}].reasonCode is invalid`);
    if (!boundedString(revocation.publicNote, 1, 300)) errors.push(`revocations[${index}].publicNote is invalid`);
  }
  return errors;
}

function publicPemFromPrivate(privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  return createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
}

function keyCoversIssuance(key, issuedAt) {
  const issuedTime = Date.parse(issuedAt);
  const starts = Date.parse(`${key.validFrom}T00:00:00Z`);
  const ends = key.validUntil === null ? Number.POSITIVE_INFINITY : Date.parse(`${key.validUntil}T23:59:59.999Z`);
  return issuedTime >= starts && issuedTime <= ends;
}

export function issueCredential({ submission, manifest, keyring, privateKeyPem, keyId, issuedAt = new Date().toISOString(), credentialId }) {
  const submissionErrors = validateCompletionSubmission(submission, manifest);
  if (submissionErrors.length > 0) throw new Error(`INVALID_COMPLETION_SUBMISSION:\n- ${submissionErrors.join("\n- ")}`);
  const keyErrors = validateIssuerKeyring(keyring);
  if (keyErrors.length > 0) throw new Error(`INVALID_ISSUER_KEYRING:\n- ${keyErrors.join("\n- ")}`);
  if (!validDateTime(issuedAt)) throw new Error("INVALID_ISSUED_AT");
  const key = keyring.keys.find((candidate) => candidate.keyId === keyId);
  if (!key) throw new Error("UNKNOWN_ISSUER_KEY");
  if (key.status !== "ACTIVE" || !keyCoversIssuance(key, issuedAt)) throw new Error("KEY_NOT_ACTIVE");
  if (publicPemFromPrivate(privateKeyPem).trim() !== key.publicKeyPem.trim()) throw new Error("PRIVATE_KEY_MISMATCH");
  const id = credentialId ?? `ABS-FND-${issuedAt.slice(0, 4)}-${randomUUID()}`;
  if (!CREDENTIAL_ID.test(id)) throw new Error("INVALID_CREDENTIAL_ID");
  const unsigned = {
    schemaVersion: 1,
    credentialId: id,
    credentialType: CREDENTIAL_TYPE,
    credentialName: CREDENTIAL_NAME,
    issuer: { id: "agentboss-school", name: "AgentBoss School" },
    holder: structuredClone(submission.holder),
    courseVersion: submission.courseVersion,
    cohort: submission.cohort,
    achievement: structuredClone(submission.completion),
    assessment: structuredClone(submission.assessment),
    issuedAt,
    validUntil: null,
    disclaimer: CREDENTIAL_DISCLAIMER,
  };
  const signatureValue = sign(null, Buffer.from(canonicalJson(unsigned)), createPrivateKey(privateKeyPem)).toString("base64url");
  return { ...unsigned, signature: { algorithm: "Ed25519", keyId, value: signatureValue } };
}

export function validateCredentialShape(credential) {
  const errors = [];
  const keys = new Set(["schemaVersion", "credentialId", "credentialType", "credentialName", "issuer", "holder", "courseVersion", "cohort", "achievement", "assessment", "issuedAt", "validUntil", "disclaimer", "signature"]);
  if (!hasExactKeys(credential, keys)) return ["credential has invalid top-level fields"];
  if (credential.schemaVersion !== 1) errors.push("credential schemaVersion must be 1");
  if (typeof credential.credentialId !== "string" || !CREDENTIAL_ID.test(credential.credentialId)) errors.push("credentialId is invalid");
  if (credential.credentialType !== CREDENTIAL_TYPE) errors.push("credentialType is invalid");
  if (!isRecord(credential.credentialName) || credential.credentialName.zh !== CREDENTIAL_NAME.zh || credential.credentialName.en !== CREDENTIAL_NAME.en) errors.push("credentialName is invalid");
  if (!isRecord(credential.issuer) || credential.issuer.id !== "agentboss-school" || credential.issuer.name !== "AgentBoss School") errors.push("issuer is invalid");
  if (!hasExactKeys(credential.holder, new Set(["publicName", "publicHandle", "profileUrl", "yearbookConsent"]))) {
    errors.push("holder is invalid");
  } else {
    if (!boundedString(credential.holder.publicName, 1, 80)) errors.push("holder.publicName is invalid");
    if (credential.holder.publicHandle !== null && (typeof credential.holder.publicHandle !== "string" || !HANDLE.test(credential.holder.publicHandle))) errors.push("holder.publicHandle is invalid");
    if (credential.holder.profileUrl !== null && (typeof credential.holder.profileUrl !== "string" || !/^https:\/\//.test(credential.holder.profileUrl) || credential.holder.profileUrl.length > 500)) errors.push("holder.profileUrl is invalid");
    if (typeof credential.holder.yearbookConsent !== "boolean") errors.push("holder.yearbookConsent is invalid");
  }
  if (typeof credential.courseVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(credential.courseVersion)) errors.push("courseVersion is invalid");
  if (typeof credential.cohort !== "string" || !COHORT.test(credential.cohort)) errors.push("cohort is invalid");
  const reconstructed = {
    schemaVersion: 1,
    credentialType: credential.credentialType,
    courseVersion: credential.courseVersion,
    cohort: credential.cohort,
    holder: credential.holder,
    completion: credential.achievement,
    assessment: credential.assessment,
  };
  const contractErrors = validateCompletionSubmission(reconstructed, {
    version: credential.courseVersion,
    nodes: FOUNDATIONS_NODES.map((id) => ({ id })),
    defaultPath: FOUNDATIONS_NODES,
  });
  for (const error of contractErrors) errors.push(`credential payload: ${error}`);
  if (!validDateTime(credential.issuedAt)) errors.push("issuedAt is invalid");
  if (credential.validUntil !== null) errors.push("validUntil must be null for Foundations v1");
  if (credential.disclaimer !== CREDENTIAL_DISCLAIMER) errors.push("disclaimer is invalid");
  if (!hasExactKeys(credential.signature, new Set(["algorithm", "keyId", "value"]))) {
    errors.push("signature is invalid");
  } else {
    if (credential.signature.algorithm !== "Ed25519") errors.push("signature algorithm is invalid");
    if (typeof credential.signature.keyId !== "string" || !KEY_ID.test(credential.signature.keyId)) errors.push("signature keyId is invalid");
    if (typeof credential.signature.value !== "string" || !/^[A-Za-z0-9_-]+$/.test(credential.signature.value)) errors.push("signature value is invalid");
  }
  return errors;
}

export function validateYearbook(yearbook) {
  const errors = [];
  if (!hasExactKeys(yearbook, new Set(["schemaVersion", "name", "entries"]))) return ["yearbook has invalid top-level fields"];
  if (yearbook.schemaVersion !== 1) errors.push("yearbook schemaVersion must be 1");
  if (yearbook.name !== "AgentBoss School Yearbook") errors.push("yearbook name is invalid");
  if (!Array.isArray(yearbook.entries)) return [...errors, "yearbook entries must be an array"];
  const ids = new Set();
  for (const [index, entry] of yearbook.entries.entries()) {
    const label = `entries[${index}]`;
    if (!hasExactKeys(entry, new Set(["credentialId", "publicName", "publicHandle", "profileUrl", "credentialName", "cohort", "courseVersion", "issuedAt", "verificationPath"]))) {
      errors.push(`${label} has invalid fields`);
      continue;
    }
    if (typeof entry.credentialId !== "string" || !CREDENTIAL_ID.test(entry.credentialId)) errors.push(`${label}.credentialId is invalid`);
    if (ids.has(entry.credentialId)) errors.push(`${label}.credentialId is duplicated`);
    ids.add(entry.credentialId);
    if (!boundedString(entry.publicName, 1, 80)) errors.push(`${label}.publicName is invalid`);
    if (entry.publicHandle !== null && (typeof entry.publicHandle !== "string" || !HANDLE.test(entry.publicHandle))) errors.push(`${label}.publicHandle is invalid`);
    if (entry.profileUrl !== null && (typeof entry.profileUrl !== "string" || !/^https:\/\//.test(entry.profileUrl) || entry.profileUrl.length > 500)) errors.push(`${label}.profileUrl is invalid`);
    if (entry.credentialName !== CREDENTIAL_NAME.en) errors.push(`${label}.credentialName is invalid`);
    if (typeof entry.cohort !== "string" || !COHORT.test(entry.cohort)) errors.push(`${label}.cohort is invalid`);
    if (typeof entry.courseVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(entry.courseVersion)) errors.push(`${label}.courseVersion is invalid`);
    if (!validDateTime(entry.issuedAt)) errors.push(`${label}.issuedAt is invalid`);
    if (entry.verificationPath !== `credentials/issued/${entry.credentialId}.json`) errors.push(`${label}.verificationPath is invalid`);
  }
  return errors;
}

export function verifyCredential({ credential, keyring, revocations }) {
  const shapeErrors = validateCredentialShape(credential);
  if (shapeErrors.length > 0) return { valid: false, code: "INVALID_SCHEMA", errors: shapeErrors };
  const keyErrors = validateIssuerKeyring(keyring);
  const revocationErrors = validateRevocations(revocations);
  if (keyErrors.length > 0 || revocationErrors.length > 0) return { valid: false, code: "INVALID_SCHEMA", errors: [...keyErrors, ...revocationErrors] };
  if (revocations.revocations.some(({ credentialId }) => credentialId === credential.credentialId)) return { valid: false, code: "CREDENTIAL_REVOKED", errors: [] };
  const key = keyring.keys.find(({ keyId }) => keyId === credential.signature.keyId);
  if (!key) return { valid: false, code: "UNKNOWN_ISSUER_KEY", errors: [] };
  if (key.status === "REVOKED" || !keyCoversIssuance(key, credential.issuedAt)) return { valid: false, code: "KEY_NOT_ACTIVE", errors: [] };
  const { signature, ...unsigned } = credential;
  let signatureValid = false;
  try {
    signatureValid = verify(null, Buffer.from(canonicalJson(unsigned)), createPublicKey(key.publicKeyPem), Buffer.from(signature.value, "base64url"));
  } catch {
    signatureValid = false;
  }
  return signatureValid
    ? { valid: true, code: "VALID", errors: [] }
    : { valid: false, code: "SIGNATURE_INVALID", errors: [] };
}

export async function loadCredentialAuthority(skillRoot) {
  const [keyring, revocations] = await Promise.all([
    readFile(resolve(skillRoot, "credentials/issuer-keys.json"), "utf8").then(JSON.parse),
    readFile(resolve(skillRoot, "credentials/revocations.json"), "utf8").then(JSON.parse),
  ]);
  return { keyring, revocations };
}

export function buildYearbookMarkdown(yearbook) {
  const errors = validateYearbook(yearbook);
  if (errors.length > 0) throw new Error(`INVALID_YEARBOOK:\n- ${errors.join("\n- ")}`);
  const lines = [
    "# AgentBoss School Yearbook · 校友名录",
    "",
    "完成 Agent Boss Foundations 课程、通过发行方审核并自愿公开姓名的学员，会记录在这里。",
    "",
  ];
  if (yearbook.entries.length === 0) {
    lines.push("当前还没有公开留册的学员。", "");
  } else {
    lines.push("| 姓名 | Handle | 届次 | 证书 | 课程版本 | 签发日期 |", "|---|---|---|---|---|---|");
    for (const entry of yearbook.entries) {
      const publicName = escapeMarkdownCell(entry.publicName);
      const name = entry.profileUrl ? `[${publicName}](${entry.profileUrl})` : publicName;
      const handle = entry.publicHandle ? `@${escapeMarkdownCell(entry.publicHandle)}` : "—";
      lines.push(`| ${name} | ${handle} | ${escapeMarkdownCell(entry.cohort)} | [${entry.credentialId}](${entry.verificationPath}) | ${escapeMarkdownCell(entry.courseVersion)} | ${entry.issuedAt.slice(0, 10)} |`);
    }
    lines.push("");
  }
  lines.push("> 名录只收录签名有效且未撤销的课程凭证。未选择公开留册不影响取得证书。", "");
  return lines.join("\n");
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
