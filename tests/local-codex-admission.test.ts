import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalCodexAdmissionRecord,
  validateLocalCodexAdmissionOptions,
} from "../scripts/run-local-codex-admission.mjs";

test("local Codex admission accepts only an absolute binary and bounded timeout", () => {
  assert.deepEqual(validateLocalCodexAdmissionOptions({
    binary: "/usr/local/bin/codex",
    timeoutSeconds: 300,
  }), {
    binary: "/usr/local/bin/codex",
    timeoutSeconds: 300,
    model: null,
  });
  assert.throws(() => validateLocalCodexAdmissionOptions({
    binary: "codex",
    timeoutSeconds: 300,
  }), /LOCAL_CODEX_BINARY_INVALID/);
  assert.throws(() => validateLocalCodexAdmissionOptions({
    binary: "/usr/local/bin/codex",
    timeoutSeconds: 10,
  }), /LOCAL_CODEX_TIMEOUT_INVALID/);
});

test("local Codex admission record contains only bounded evidence", () => {
  const record = createLocalCodexAdmissionRecord({
    recordedAt: "2026-09-01T01:02:03.000Z",
    codexVersion: "codex-cli 0.144.1",
    observation: {
      workId: "local-codex-admission",
      sequence: 2,
      status: "COMPLETED",
      summary: "Read-only admission passed",
      evidenceRefs: ["codex-result-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      evidenceOutputs: [{
        evidenceReference: "codex-result-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        contentDigest: `sha256:${"a".repeat(64)}`,
      }],
      resultReference: "codex-result-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      recordedAt: "2026-09-01T01:02:03.000Z",
      usageOutputs: [{
        usageReference: "codex-usage-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        biller: "openai",
        billingType: "unknown",
        costStatus: "unpriced",
        inputTokens: 120,
        cachedInputTokens: 20,
        outputTokens: 30,
        costCents: 0,
        occurredAt: "2026-09-01T01:02:03.000Z",
      }],
    },
  });
  assert.deepEqual(record, {
    schemaVersion: 1,
    recordType: "COMPANY_OS_LOCAL_CODEX_ADMISSION",
    recordedAt: "2026-09-01T01:02:03.000Z",
    codexVersion: "codex-cli 0.144.1",
    authentication: "LOCAL_CODEX_SESSION",
    sandbox: "read-only",
    approvalPolicy: "never",
    ephemeral: true,
    outcome: "PASS",
    summary: "Read-only admission passed",
    resultReference: "codex-result-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    resultDigest: `sha256:${"a".repeat(64)}`,
    usage: { inputTokens: 120, cachedInputTokens: 20, outputTokens: 30 },
    notClaimed: ["customer staging acceptance", "production acceptance", "side-effecting execution"],
  });
  assert.doesNotMatch(JSON.stringify(record),
    /"(?:credential|secret|password|cookie|threadId|sessionId|raw)[^"]*":/i);
});

test("local Codex admission refuses incomplete or private observations", () => {
  assert.throws(() => createLocalCodexAdmissionRecord({
    recordedAt: "2026-09-01T01:02:03.000Z",
    codexVersion: "codex-cli 0.144.1",
    observation: { status: "FAILED", summary: "CODEX_EXEC_FAILED" },
  }), /LOCAL_CODEX_ADMISSION_INCOMPLETE/);
  assert.throws(() => createLocalCodexAdmissionRecord({
    recordedAt: "2026-09-01T01:02:03.000Z",
    codexVersion: "codex-cli 0.144.1",
    observation: {
      status: "COMPLETED",
      summary: "private token leaked",
      resultReference: "codex-result-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      evidenceOutputs: [{ contentDigest: `sha256:${"a".repeat(64)}` }],
      usageOutputs: [{ inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }],
    },
  }), /LOCAL_CODEX_ADMISSION_PRIVATE_MATERIAL/);
});
