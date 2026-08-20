import assert from "node:assert/strict";
import test from "node:test";

import {
  createFormalAssignment,
  formalWebFailure,
} from "../web/formal-work-state.ts";

const options = {
  viewerId: "human-one",
  agents: [{
    id: "agent-one", name: "Agent One", departmentId: "operations",
    allowedActionIds: ["read-knowledge", "publish-content"],
  }],
} as const;

test("formal assignment derives actor, department and actions from server projection", () => {
  assert.deepEqual(createFormalAssignment(options, {
    title: "  Market brief ", goal: " Prepare evidence ", agentId: "agent-one",
  }), {
    title: "Market brief", goal: "Prepare evidence", agentId: "agent-one",
    departmentId: "operations", requestedBy: "human-one",
    actionIds: ["read-knowledge", "publish-content"],
  });
  assert.throws(() => createFormalAssignment(options, {
    title: "Brief", goal: "Goal", agentId: "unknown",
  }), /FORMAL_AGENT_NOT_ALLOWED/);
  assert.throws(() => createFormalAssignment(options, {
    title: " ", goal: "Goal", agentId: "agent-one",
  }), /FORMAL_WORK_INPUT_REQUIRED/);
});

test("formal Web maps stable codes to explicit recoverable states", () => {
  assert.deepEqual(formalWebFailure(new Error("FORMAL_IDENTITY_REQUIRED")), {
    kind: "UNAUTHORIZED", code: "FORMAL_IDENTITY_REQUIRED", copy: "需要正式登录后才能进入这家公司。",
  });
  assert.equal(formalWebFailure(new TypeError("fetch failed")).kind, "OFFLINE");
  assert.equal(formalWebFailure(new Error("TENANT_MISMATCH")).kind, "FORBIDDEN");
  assert.equal(formalWebFailure(new Error("anything")).kind, "FAILURE");
});
