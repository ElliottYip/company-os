import assert from "node:assert/strict";
import test from "node:test";

import {
  migrateLegacyGovernedAgent,
  validateAgentPortfolioRecord,
  type AgentPortfolioRecord,
} from "../core/agent-portfolio.ts";

const base = {
  id: "agent-one",
  companyId: "company-one",
  displayName: "Research Agent",
  accountableHumanId: "human-one",
  providerReference: "provider-one",
  runtimeReference: "runtime-one",
  source: {
    connectorId: "connector-one",
    externalId: "external-agent-one",
    externalUrl: "https://reference.example/agents/one",
  },
  permissionIds: ["permission-read"],
  dataAuthorizationIds: [],
  lifecycleStatus: "ACTIVE",
  connectorHealth: "HEALTHY",
  synchronizedAt: "2026-08-27T08:00:00.000Z",
} as const;

test("Personal Agents are inventory assets and expose no private Work", () => {
  const personal = validateAgentPortfolioRecord({
    ...base,
    agentClass: "PERSONAL",
    managementDepth: "INVENTORY",
    executionOwner: "HUMAN_ENDPOINT",
    workVisibility: "NONE",
    privacyBoundary: "PRIVATE_ACTIVITY_EXCLUDED",
  });

  assert.equal(personal.agentClass, "PERSONAL");
  assert.equal(personal.workVisibility, "NONE");
  assert.equal(personal.privacyBoundary, "PRIVATE_ACTIVITY_EXCLUDED");
});

test("Shared Agents may be observed without claiming ANC execution control", () => {
  const observed = validateAgentPortfolioRecord({
    ...base,
    agentClass: "SHARED",
    managementDepth: "OBSERVED",
    executionOwner: "EXTERNAL_PLATFORM",
    workVisibility: "SUMMARY_AND_REFERENCES",
    privacyBoundary: "BOUNDED_SOURCE_RECORDS",
  });

  assert.equal(observed.managementDepth, "OBSERVED");
  assert.equal(observed.executionOwner, "EXTERNAL_PLATFORM");
});

test("Governed Shared Agents are owned by an ANC Connector", () => {
  const governed = validateAgentPortfolioRecord({
    ...base,
    agentClass: "SHARED",
    managementDepth: "GOVERNED",
    executionOwner: "ANC_CONNECTOR",
    workVisibility: "GOVERNED_RECORD",
    privacyBoundary: "GOVERNED_AUTHORITY_ONLY",
  });

  assert.equal(governed.managementDepth, "GOVERNED");
});

test("Federated Runtime Agents cannot claim ANC execution ownership", () => {
  const federated = validateAgentPortfolioRecord({
    ...base,
    agentClass: "FEDERATED_RUNTIME",
    managementDepth: "FEDERATED",
    executionOwner: "EXTERNAL_PLATFORM",
    workVisibility: "SUMMARY_AND_REFERENCES",
    privacyBoundary: "BOUNDED_SOURCE_RECORDS",
  });
  assert.equal(federated.executionOwner, "EXTERNAL_PLATFORM");

  assert.throws(() => validateAgentPortfolioRecord({
    ...federated,
    executionOwner: "ANC_CONNECTOR",
  }), /AGENT_PORTFOLIO_FEDERATED_EXECUTION_OWNER_INVALID/);
});

test("management depth cannot overstate Work visibility or control", () => {
  assert.throws(() => validateAgentPortfolioRecord({
    ...base,
    agentClass: "PERSONAL",
    managementDepth: "INVENTORY",
    executionOwner: "HUMAN_ENDPOINT",
    workVisibility: "GOVERNED_RECORD",
    privacyBoundary: "PRIVATE_ACTIVITY_EXCLUDED",
  }), /AGENT_PORTFOLIO_INVENTORY_VISIBILITY_INVALID/);

  assert.throws(() => validateAgentPortfolioRecord({
    ...base,
    agentClass: "SHARED",
    managementDepth: "GOVERNED",
    executionOwner: "EXTERNAL_PLATFORM",
    workVisibility: "GOVERNED_RECORD",
    privacyBoundary: "GOVERNED_AUTHORITY_ONLY",
  }), /AGENT_PORTFOLIO_GOVERNED_EXECUTION_OWNER_INVALID/);
});

test("legacy executable Agents migrate to Shared Governed records without losing identity", () => {
  const migrated = migrateLegacyGovernedAgent({
    id: "agent-one",
    companyId: "company-one",
    displayName: "Research Agent",
    runtimeConnectorId: "connector-one",
    accountableHumanId: "human-one",
    role: "Research",
    autonomyLevel: 2,
  }, {
    lifecycleStatus: "ACTIVE",
    connectorHealth: "HEALTHY",
  });

  assert.deepEqual(migrated, {
    id: "agent-one",
    companyId: "company-one",
    displayName: "Research Agent",
    accountableHumanId: "human-one",
    providerReference: null,
    runtimeReference: "connector-one",
    source: {
      connectorId: "connector-one",
      externalId: null,
      externalUrl: null,
    },
    permissionIds: [],
    dataAuthorizationIds: [],
    lifecycleStatus: "ACTIVE",
    connectorHealth: "HEALTHY",
    synchronizedAt: null,
    agentClass: "SHARED",
    managementDepth: "GOVERNED",
    executionOwner: "ANC_CONNECTOR",
    workVisibility: "GOVERNED_RECORD",
    privacyBoundary: "GOVERNED_AUTHORITY_ONLY",
  } satisfies AgentPortfolioRecord);
});

