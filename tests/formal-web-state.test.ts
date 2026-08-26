import assert from "node:assert/strict";
import test from "node:test";

import {
  createFormalAssignment,
  formalWebFailure,
} from "../web/formal-work-state.ts";

const options = {
  viewerId: "human-one",
  lifecycle: { revision: 1, agents: [] },
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

test("formal assignment binds an authorized data request without exposing enterprise records", () => {
  const assignment = createFormalAssignment(options, {
    title: "Customer brief", goal: "Prepare evidence", agentId: "agent-one",
    dataAccess: { contractId: "contract-one", operation: "READ", purpose: "customer-report",
      classification: "CONFIDENTIAL", destinationId: "", contentDigest: "" },
  }, [{ id: "contract-one", companyId: "company-one", dataSourceId: "crm-one",
    authorizedAgentIds: ["agent-one"], authorizedOperations: ["READ"],
    allowedPurposes: ["customer-report"], maximumClassification: "CONFIDENTIAL",
    allowedExportDestinations: [], validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z", status: "ACTIVE" }]);
  const request = assignment.executionPreparation?.dataAccess[0];
  assert.match(request?.requestId ?? "", /^data-request-/);
  assert.deepEqual({ ...request, requestId: "generated" }, {
    requestId: "generated", contractId: "contract-one", dataSourceId: "crm-one",
    operation: "READ", purpose: "customer-report", classification: "CONFIDENTIAL",
    destinationId: null, contentDigest: null,
  });
  assert.deepEqual(assignment.executionPreparation?.secretLeases, []);
  assert.throws(() => createFormalAssignment(options, {
    title: "Customer brief", goal: "Prepare evidence", agentId: "agent-one",
    dataAccess: { contractId: "contract-one", operation: "EXPORT", purpose: "customer-report",
      classification: "CONFIDENTIAL", destinationId: "", contentDigest: "" },
  }, []), /FORMAL_DATA_CONTRACT_NOT_ALLOWED/);
});

test("formal assignment binds only an enabled model policy choice", () => {
  const policies = [{ id: "default-models", companyId: "company-one", routes: [{
    id: "local-primary", providerAdapterId: "provider-one", modelReference: "model-one",
    allowedDataClassifications: ["INTERNAL" as const], residency: "LOCAL" as const,
    enabled: true, credentialConfigured: true,
  }] }];
  const assignment = createFormalAssignment(options, {
    title: "Market brief", goal: "Prepare evidence", agentId: "agent-one",
    modelRouting: { companyId: "company-one", policyId: "default-models",
      classification: "INTERNAL", requiredResidency: "LOCAL" },
  }, [], policies);
  assert.deepEqual(assignment.executionPreparation, {
    dataAccess: [], secretLeases: [],
    modelRouting: { companyId: "company-one", policyId: "default-models",
      classification: "INTERNAL", requiredResidency: "LOCAL" },
  });
  assert.throws(() => createFormalAssignment(options, {
    title: "Market brief", goal: "Prepare evidence", agentId: "agent-one",
    modelRouting: { companyId: "company-one", policyId: "default-models",
      classification: "RESTRICTED", requiredResidency: "LOCAL" },
  }, [], policies), /FORMAL_MODEL_ROUTE_NOT_ALLOWED/);
});

test("formal Web maps stable codes to explicit recoverable states", () => {
  assert.deepEqual(formalWebFailure(new Error("FORMAL_IDENTITY_REQUIRED")), {
    kind: "UNAUTHORIZED", code: "FORMAL_IDENTITY_REQUIRED", copy: "需要正式登录后才能进入这家公司。",
  });
  assert.equal(formalWebFailure(new TypeError("fetch failed")).kind, "OFFLINE");
  assert.equal(formalWebFailure(new Error("FORMAL_API_UNREACHABLE")).kind, "OFFLINE");
  assert.equal(formalWebFailure(new Error("FORMAL_API_REQUEST_TIMEOUT")).kind, "OFFLINE");
  assert.equal(formalWebFailure(new Error("TENANT_MISMATCH")).kind, "FORBIDDEN");
  assert.deepEqual(formalWebFailure(new Error("BUDGET_HARD_STOP")), {
    kind: "LIMIT", code: "BUDGET_HARD_STOP", copy: "已达到适用预算上限，无法创建新的工作。",
  });
  assert.equal(formalWebFailure(new Error("anything")).kind, "FAILURE");
});
