import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialAgentRuntimeBinding,
  transitionAgentRuntimeBinding,
  validateAgentRuntimeBindingSnapshot,
} from "../core/agent-runtime-binding.ts";

const occurredAt = "2026-09-05T08:00:00.000Z";

test("an Agent created without a Runtime has an explicit unbound binding record", () => {
  assert.deepEqual(createInitialAgentRuntimeBinding({
    companyId: "company-one",
    agentId: "agent-one",
    runtimeConnectorId: "connector-unbound",
    occurredAt,
  }), {
    companyId: "company-one",
    agentId: "agent-one",
    connectorId: null,
    capabilityDigest: null,
    revision: 0,
    status: "UNBOUND",
    changedBy: null,
    reason: null,
    changedAt: occurredAt,
  });
});

test("a reviewed command binds, rebinds and unbinds an Agent without rewriting history", () => {
  const initial = createInitialAgentRuntimeBinding({
    companyId: "company-one", agentId: "agent-one",
    runtimeConnectorId: "connector-unbound", occurredAt,
  });
  const bound = transitionAgentRuntimeBinding(initial, {
    operation: "BIND", connectorId: "connector-one",
    capabilityDigest: `sha256:${"1".repeat(64)}`, expectedRevision: 0,
    actorId: "human-one", reason: "Connect the approved customer runtime",
    occurredAt: "2026-09-05T08:01:00.000Z",
  });
  assert.equal(bound.revision, 1);
  assert.equal(bound.connectorId, "connector-one");
  assert.equal(bound.status, "BOUND_UNVERIFIED");

  const rebound = transitionAgentRuntimeBinding(bound, {
    operation: "BIND", connectorId: "connector-two",
    capabilityDigest: `sha256:${"2".repeat(64)}`, expectedRevision: 1,
    actorId: "human-one", reason: "Move after the previous runtime was drained",
    occurredAt: "2026-09-05T08:02:00.000Z",
  });
  assert.equal(rebound.revision, 2);
  assert.equal(rebound.connectorId, "connector-two");

  const unbound = transitionAgentRuntimeBinding(rebound, {
    operation: "UNBIND", connectorId: null, capabilityDigest: null, expectedRevision: 2,
    actorId: "human-one", reason: "Retire the runtime binding",
    occurredAt: "2026-09-05T08:03:00.000Z",
  });
  assert.equal(unbound.revision, 3);
  assert.equal(unbound.connectorId, null);
  assert.equal(unbound.status, "UNBOUND");
});

test("runtime binding rejects stale, no-op and malformed commands", () => {
  const current = createInitialAgentRuntimeBinding({
    companyId: "company-one", agentId: "agent-one",
    runtimeConnectorId: "connector-one", occurredAt,
  });
  assert.throws(() => transitionAgentRuntimeBinding(current, {
    operation: "BIND", connectorId: "connector-two",
    capabilityDigest: `sha256:${"2".repeat(64)}`, expectedRevision: 1,
    actorId: "human-one", reason: "Move runtime", occurredAt,
  }), /AGENT_RUNTIME_BINDING_REVISION_CONFLICT/);
  assert.throws(() => transitionAgentRuntimeBinding(current, {
    operation: "BIND", connectorId: "connector-one",
    capabilityDigest: `sha256:${"1".repeat(64)}`, expectedRevision: 0,
    actorId: "human-one", reason: "No change", occurredAt,
  }), /AGENT_RUNTIME_BINDING_NO_CHANGE/);
  assert.throws(() => transitionAgentRuntimeBinding(current, {
    operation: "UNBIND", connectorId: "connector-two", capabilityDigest: null, expectedRevision: 0,
    actorId: "human-one", reason: "Invalid unbind", occurredAt,
  }), /AGENT_RUNTIME_BINDING_COMMAND_INVALID/);
  assert.throws(() => transitionAgentRuntimeBinding(current, {
    operation: "BIND", connectorId: "connector-two", capabilityDigest: "not-a-digest", expectedRevision: 0,
    actorId: "human-one", reason: " ", occurredAt,
  }), /AGENT_RUNTIME_BINDING_COMMAND_INVALID/);
});

test("binding snapshots require one valid record per Agent", () => {
  assert.throws(() => validateAgentRuntimeBindingSnapshot({
    revision: 1,
    bindings: [{
      companyId: "company-one", agentId: "agent-one", connectorId: null,
      capabilityDigest: null,
      revision: 1, status: "BOUND_UNVERIFIED", changedBy: "human-one",
      reason: "bad state", changedAt: occurredAt,
    }],
  }), /AGENT_RUNTIME_BINDING_STATE_INVALID/);
});
