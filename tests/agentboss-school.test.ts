import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repositoryRoot = resolve(import.meta.dirname, "..");
const schoolRoot = resolve(repositoryRoot, "skills/agentboss-school");

function run(relativeScript: string, ...args: string[]) {
  return spawnSync(process.execPath, [resolve(schoolRoot, relativeScript), ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function runInstalled(target: string, relativeScript: string, ...args: string[]) {
  return spawnSync(process.execPath, [resolve(target, relativeScript), ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("AgentBoss School curriculum graph and required lesson contracts validate", () => {
  const result = run("scripts/validate-curriculum.mjs");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /4 courses, 30 nodes, curriculum valid/);
});

test("AgentBoss School accepts a minimal privacy-safe learner state", () => {
  const fixture = resolve(schoolRoot, "scripts/fixtures/valid-state.json");
  const result = run("scripts/validate-state.mjs", fixture);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Validated 1 AgentBoss School state file/);
});

test("AgentBoss School keeps compatible 0.1 learner state readable after later curriculum expansion", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agentboss-school-state-test-"));
  try {
    const previousState = JSON.parse(readFileSync(resolve(schoolRoot, "scripts/fixtures/valid-state.json"), "utf8"));
    previousState.curriculumVersion = "0.1.0";
    const previousStatePath = resolve(temporaryRoot, "previous-state.json");
    writeFileSync(previousStatePath, `${JSON.stringify(previousState, null, 2)}\n`);
    const result = run("scripts/validate-state.mjs", previousStatePath);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("AgentBoss School rejects credentials in an otherwise valid learner state", () => {
  const fixture = resolve(schoolRoot, "scripts/fixtures/invalid-sensitive-state.json");
  const result = run("scripts/validate-state.mjs", fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /apiToken: forbidden sensitive-data field/);
  assert.doesNotMatch(result.stderr, /must be an object|is invalid|must be YYYY-MM-DD/);
});

test("AgentBoss School installs a validated package without silent replacement", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agentboss-school-test-"));
  const target = resolve(temporaryRoot, "agentboss-school");
  try {
    const firstInstall = run("scripts/install.mjs", "--target", target);
    assert.equal(firstInstall.status, 0, firstInstall.stderr);
    assert.match(firstInstall.stdout, /Installed AgentBoss School 0\.7\.1/);
    assert.match(readFileSync(resolve(target, "SKILL.md"), "utf8"), /AgentBoss School · 教务处/);
    assert.match(readFileSync(resolve(target, "references/classroom-runtime.md"), "utf8"), /第一幕·看见问题/);
    assert.match(readFileSync(resolve(target, "LICENSE"), "utf8"), /^MIT License/);

    const validation = spawnSync(process.execPath, [resolve(target, "scripts/validate-curriculum.mjs")], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    assert.equal(validation.status, 0, validation.stderr);

    const secondInstall = run("scripts/install.mjs", "--target", target);
    assert.equal(secondInstall.status, 1);
    assert.match(secondInstall.stderr, /target already exists/);

    writeFileSync(resolve(target, "local-marker.txt"), "previous installation");
    const replacement = run("scripts/install.mjs", "--target", target, "--replace");
    assert.equal(replacement.status, 0, replacement.stderr);
    assert.match(replacement.stdout, /Previous installation retained at/);
    const backups = readdirSync(temporaryRoot).filter((entry) => entry.startsWith("agentboss-school.backup-"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(resolve(temporaryRoot, backups[0], "local-marker.txt"), "utf8"), "previous installation");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("AgentBoss School issues verifiable credentials and keeps Yearbook consent separate", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agentboss-school-credential-test-"));
  const target = resolve(temporaryRoot, "agentboss-school");
  try {
    const installation = run("scripts/install.mjs", "--target", target);
    assert.equal(installation.status, 0, installation.stderr);

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPath = resolve(temporaryRoot, "issuer-private.pem");
    writeFileSync(privateKeyPath, privateKey.export({ format: "pem", type: "pkcs8" }).toString(), { mode: 0o600 });
    const keyring = {
      schemaVersion: 1,
      keys: [{
        keyId: "abs-issuer-2026",
        algorithm: "Ed25519",
        publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
        status: "ACTIVE",
        validFrom: "2026-01-01",
        validUntil: null,
      }],
    };
    writeFileSync(resolve(target, "credentials/issuer-keys.json"), `${JSON.stringify(keyring, null, 2)}\n`);

    const example = JSON.parse(readFileSync(resolve(target, "credentials/completion-submission.example.json"), "utf8"));
    const consentedSubmission = {
      ...example,
      holder: { ...example.holder, publicName: "Elliott Example", yearbookConsent: true },
    };
    const consentedPath = resolve(temporaryRoot, "completion-consented.json");
    writeFileSync(consentedPath, `${JSON.stringify(consentedSubmission, null, 2)}\n`);
    const credentialPath = resolve(temporaryRoot, "credential.json");
    const credentialId = "ABS-FND-2026-11111111-2222-4333-8444-555555555555";
    const issuance = runInstalled(
      target,
      "scripts/issue-credential.mjs",
      "--input", consentedPath,
      "--private-key", privateKeyPath,
      "--key-id", "abs-issuer-2026",
      "--output", credentialPath,
      "--issued-at", "2026-08-24T08:00:00.000Z",
      "--credential-id", credentialId,
    );
    assert.equal(issuance.status, 0, issuance.stderr);

    const verification = runInstalled(target, "scripts/verify-credential.mjs", credentialPath);
    assert.equal(verification.status, 0, verification.stderr);
    assert.equal(JSON.parse(verification.stdout).code, "VALID");

    const certificatePath = resolve(temporaryRoot, "certificate.html");
    const rendering = runInstalled(target, "scripts/render-certificate.mjs", credentialPath, "--output", certificatePath);
    assert.equal(rendering.status, 0, rendering.stderr);
    assert.match(readFileSync(certificatePath, "utf8"), /Agent Boss Foundations Certificate/);
    assert.match(readFileSync(certificatePath, "utf8"), /Elliott Example/);

    const registration = runInstalled(target, "scripts/register-yearbook.mjs", credentialPath);
    assert.equal(registration.status, 0, registration.stderr);
    assert.match(readFileSync(resolve(target, "YEARBOOK.md"), "utf8"), /Elliott Example/);
    assert.match(readFileSync(resolve(target, "YEARBOOK.md"), "utf8"), new RegExp(credentialId));

    const tampered = JSON.parse(readFileSync(credentialPath, "utf8"));
    tampered.holder.publicName = "Tampered Name";
    const tamperedPath = resolve(temporaryRoot, "credential-tampered.json");
    writeFileSync(tamperedPath, `${JSON.stringify(tampered, null, 2)}\n`);
    const rejectedTampering = runInstalled(target, "scripts/verify-credential.mjs", tamperedPath);
    assert.equal(rejectedTampering.status, 1);
    assert.equal(JSON.parse(rejectedTampering.stdout).code, "SIGNATURE_INVALID");

    const privateSubmissionPath = resolve(temporaryRoot, "completion-private.json");
    writeFileSync(privateSubmissionPath, `${JSON.stringify({ ...example, holder: { ...example.holder, publicName: "Private Learner", yearbookConsent: false } }, null, 2)}\n`);
    const privateCredentialPath = resolve(temporaryRoot, "credential-private.json");
    const privateIssuance = runInstalled(
      target,
      "scripts/issue-credential.mjs",
      "--input", privateSubmissionPath,
      "--private-key", privateKeyPath,
      "--key-id", "abs-issuer-2026",
      "--output", privateCredentialPath,
      "--issued-at", "2026-08-24T08:05:00.000Z",
      "--credential-id", "ABS-FND-2026-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    assert.equal(privateIssuance.status, 0, privateIssuance.stderr);
    const rejectedRegistration = runInstalled(target, "scripts/register-yearbook.mjs", privateCredentialPath);
    assert.equal(rejectedRegistration.status, 1);
    assert.match(rejectedRegistration.stderr, /YEARBOOK_CONSENT_REQUIRED/);

    writeFileSync(resolve(target, "credentials/revocations.json"), `${JSON.stringify({
      schemaVersion: 1,
      revocations: [{
        credentialId,
        revokedAt: "2026-08-25T00:00:00.000Z",
        reasonCode: "TEST_REVOCATION",
        publicNote: "Test-only revocation fixture.",
      }],
    }, null, 2)}\n`);
    const revoked = runInstalled(target, "scripts/verify-credential.mjs", credentialPath);
    assert.equal(revoked.status, 1);
    assert.equal(JSON.parse(revoked.stdout).code, "CREDENTIAL_REVOKED");

    const removal = runInstalled(target, "scripts/remove-yearbook-entry.mjs", credentialId);
    assert.equal(removal.status, 0, removal.stderr);
    assert.doesNotMatch(readFileSync(resolve(target, "YEARBOOK.md"), "utf8"), /Elliott Example/);
    assert.equal(JSON.parse(removal.stdout).credentialStatusUnchanged, true);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("AgentBoss School retrieves synthetic teaching cases without presenting them as evidence", () => {
  const result = run(
    "scripts/retrieve-cases.mjs",
    "付款超时 重试 对账",
    "--node", "operations/retry-and-outcome-unknown",
    "--top", "2",
    "--json",
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.resultCount > 0, true);
  assert.equal(payload.results[0].caseId, "case-synthetic-invoice-timeout");
  assert.equal(payload.results[0].caseType, "SYNTHETIC_SCENARIO");
  assert.equal(payload.results[0].evidenceQuality, "ILLUSTRATIVE");
  assert.equal(payload.results[0].outcomeClaims.every(({ verification }: { readonly verification: string }) => verification === "UNVERIFIED"), true);

  const absent = run("scripts/retrieve-cases.mjs", "zzzz-no-such-agentboss-case", "--top", "3", "--json");
  assert.equal(absent.status, 0, absent.stderr);
  assert.deepEqual(JSON.parse(absent.stdout).results, []);
});

test("AgentBoss School runs progressive-disclosure Labs and separates machine checks from mentor judgment", () => {
  const listing = run("scripts/run-practice-lab.mjs", "--list");
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /outcome-unknown/);
  assert.match(listing.stdout, /agent-security/);
  assert.match(listing.stdout, /team-pilot/);

  const firstRound = run("scripts/run-practice-lab.mjs", "--scenario", "outcome-unknown", "--round", "1");
  assert.equal(firstRound.status, 0, firstRound.stderr);
  assert.match(firstRound.stdout, /SYNTHETIC_SCENARIO \/ ILLUSTRATIVE \/ UNVERIFIED/);
  assert.match(firstRound.stdout, /client:timeout/);
  assert.doesNotMatch(firstRound.stdout, /bank:pending-request-8842/);

  const passing = run(
    "scripts/run-practice-lab.mjs",
    "--score", "outcome-unknown",
    "--submission", resolve(schoolRoot, "practice/submission.example.json"),
    "--json",
  );
  assert.equal(passing.status, 0, passing.stderr);
  const result = JSON.parse(passing.stdout);
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
  assert.match(result.machineAssessmentBoundary, /不替代导师审阅/);

  const temporaryRoot = mkdtempSync(join(tmpdir(), "agentboss-school-practice-test-"));
  try {
    const weakSubmission = JSON.parse(readFileSync(resolve(schoolRoot, "practice/submission.example.json"), "utf8"));
    weakSubmission.rounds[0].action = "RETRY_NEW_REQUEST";
    weakSubmission.rounds[0].prohibitedActions = [];
    const weakPath = resolve(temporaryRoot, "weak.json");
    writeFileSync(weakPath, `${JSON.stringify(weakSubmission, null, 2)}\n`);
    const rejected = run("scripts/run-practice-lab.mjs", "--score", "outcome-unknown", "--submission", weakPath, "--json");
    assert.equal(rejected.status, 2);
    assert.equal(JSON.parse(rejected.stdout).passed, false);

    const placeholderSubmission = JSON.parse(readFileSync(resolve(schoolRoot, "practice/submission.example.json"), "utf8"));
    for (const round of placeholderSubmission.rounds) {
      round.rationale = "xxxxxxxx";
      round.owner = "xx";
      round.resumeCondition = "xxxxxxxx";
    }
    const placeholderPath = resolve(temporaryRoot, "placeholder.json");
    writeFileSync(placeholderPath, `${JSON.stringify(placeholderSubmission, null, 2)}\n`);
    const rejectedPlaceholder = run("scripts/run-practice-lab.mjs", "--score", "outcome-unknown", "--submission", placeholderPath, "--json");
    assert.equal(rejectedPlaceholder.status, 2);
    const placeholderResult = JSON.parse(rejectedPlaceholder.stdout);
    assert.equal(placeholderResult.passed, false);
    assert.equal(placeholderResult.blockingFailures.every((id: string) => id.endsWith("-handoff")), true);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("AgentBoss School case RAG indexes a labelled case and rejects an unauthorized client case", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agentboss-school-rag-test-"));
  const target = resolve(temporaryRoot, "agentboss-school");
  try {
    const installation = run("scripts/install.mjs", "--target", target);
    assert.equal(installation.status, 0, installation.stderr);

    const caseFile = resolve(target, "references/cases/case-demo-approval.md");
    writeFileSync(caseFile, [
      "# 演示内容发布审批",
      "",
      "## 关键决策",
      "",
      "Agent 完成市场简报后暂停发布。负责真人核对动作输入摘要、工作、执行 Agent、证据与有效期，再决定是否批准。",
      "",
      "## 限制",
      "",
      "这是确定性演示，只解释精确审批机制，不代表客户效果。",
      "",
    ].join("\n"));
    const catalogPath = resolve(target, "rag/case-catalog.json");
    const entry = {
      id: "case-demo-approval",
      title: "演示内容发布的精确审批",
      summary: "展示 Agent 在发布前暂停并由负责真人核对准确动作绑定。",
      language: "zh-CN",
      status: "VERIFIED",
      caseType: "DEMO_FIXTURE",
      industries: ["content-operations"],
      capabilities: ["governance", "operations"],
      lessonNodes: ["governance/exact-action-approval"],
      evidenceQuality: "ILLUSTRATIVE",
      isAnonymized: true,
      source: { label: "AgentBoss School test fixture", uri: null, consentReference: null },
      outcomeClaims: [],
      contentFile: "references/cases/case-demo-approval.md",
      updatedAt: "2026-08-24",
    };
    writeFileSync(catalogPath, `${JSON.stringify({ schemaVersion: 1, cases: [entry] }, null, 2)}\n`);

    const build = spawnSync(process.execPath, [resolve(target, "scripts/build-case-index.mjs")], { encoding: "utf8" });
    assert.equal(build.status, 0, build.stderr);
    assert.match(build.stdout, /1 cases, 2 chunks/);

    const retrieval = spawnSync(process.execPath, [
      resolve(target, "scripts/retrieve-cases.mjs"),
      "发布审批",
      "--node", "governance/exact-action-approval",
      "--json",
    ], { encoding: "utf8" });
    assert.equal(retrieval.status, 0, retrieval.stderr);
    const payload = JSON.parse(retrieval.stdout);
    assert.equal(payload.resultCount > 0, true);
    assert.equal(payload.results[0].caseId, "case-demo-approval");
    assert.equal(payload.results[0].caseType, "DEMO_FIXTURE");
    assert.equal(payload.results[0].evidenceQuality, "ILLUSTRATIVE");
    assert.equal(payload.results.some(({ text }: { readonly text: string }) => /负责真人核对动作输入摘要/.test(text)), true);

    const unauthorized = {
      ...entry,
      caseType: "AUTHORIZED_CLIENT",
      isAnonymized: false,
      source: { ...entry.source, consentReference: null },
    };
    writeFileSync(catalogPath, `${JSON.stringify({ schemaVersion: 1, cases: [unauthorized] }, null, 2)}\n`);
    const rejected = spawnSync(process.execPath, [resolve(target, "scripts/build-case-index.mjs")], { encoding: "utf8" });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /authorized client case must be anonymized/);
    assert.match(rejected.stderr, /authorized client case requires consentReference/);

    const dishonestSynthetic = {
      ...entry,
      caseType: "SYNTHETIC_SCENARIO",
      evidenceQuality: "SOURCE_BACKED",
      outcomeClaims: [{ claim: "虚构成效", evidenceReference: "fake-evidence", verification: "SOURCE_BACKED" }],
    };
    writeFileSync(catalogPath, `${JSON.stringify({ schemaVersion: 1, cases: [dishonestSynthetic] }, null, 2)}\n`);
    const rejectedSynthetic = spawnSync(process.execPath, [resolve(target, "scripts/build-case-index.mjs")], { encoding: "utf8" });
    assert.equal(rejectedSynthetic.status, 1);
    assert.match(rejectedSynthetic.stderr, /synthetic scenario must use ILLUSTRATIVE evidence/);
    assert.match(rejectedSynthetic.stderr, /synthetic scenario outcome must remain UNVERIFIED/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
