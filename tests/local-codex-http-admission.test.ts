import assert from "node:assert/strict";
import test from "node:test";
import { createLocalCodexHttpAdmissionRecord } from "../scripts/run-local-codex-http-admission.mjs";

const capabilities = { connectorId: "http-agent-node", protocolVersion: "1.0" };
const completed = { status: "COMPLETED", summary: "Synthetic verification completed", resultReference: "result-one",
  evidenceOutputs: [{ evidenceReference: "result-one", contentDigest: `sha256:${"a".repeat(64)}` }],
  usageOutputs: [{ usageReference: "usage-one", inputTokens: 10, cachedInputTokens: 2, outputTokens: 3 }] };

test("HTTP Codex admission accepts token accounting fields while scanning only observation text for private material", () => {
  const result = createLocalCodexHttpAdmissionRecord([
    { status: "WORKING", summary: "Started" },
    { status: "AWAITING_APPROVAL", summary: "Paused for exact approval" },
    { status: "WORKING", summary: "Resumed" }, completed,
  ], capabilities, "2026-09-05T08:02:21.443Z");
  assert.equal(result.execution.outcome, "PASS");
  assert.equal(result.evidence.usage.inputTokens, 10);
});

test("HTTP Codex admission rejects incomplete recovery sequences and private summary text", () => {
  assert.throws(() => createLocalCodexHttpAdmissionRecord([
    { status: "WORKING", summary: "Started" }, completed,
  ], capabilities), /LOCAL_CODEX_HTTP_ADMISSION_INCOMPLETE/);
  assert.throws(() => createLocalCodexHttpAdmissionRecord([
    { status: "WORKING", summary: "Started" },
    { status: "AWAITING_APPROVAL", summary: "Paused" },
    { status: "WORKING", summary: "session id leaked" }, completed,
  ], capabilities), /LOCAL_CODEX_HTTP_ADMISSION_INCOMPLETE/);
});
