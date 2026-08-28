import {
  validateAgentCredentialStatus,
  validateAgentSubscription,
} from "../../core/agent-commercial-governance.ts";
import { validateAgentPortfolioRecord } from "../../core/agent-portfolio.ts";
import type {
  CreateDemoPortfolioFixture,
  DemoPortfolioSnapshot,
} from "../../core/demo-portfolio.ts";
import { validateExternalWork } from "../../core/cross-source-work.ts";

export const createDemoPortfolioFixture: CreateDemoPortfolioFixture = (
  input,
): DemoPortfolioSnapshot => {
  const personal = [
    ["personal-elliott", "Elliott’s Codex · fixture", "demo-elliott", "openai-reference", "codex-reference"],
    ["personal-mia", "Mia’s Claude Code · fixture", "demo-mia", "anthropic-reference", "claude-code-reference"],
    ["personal-alex", "Alex’s Raft Agent · fixture", "demo-alex", "raft-reference", "raft-agent-reference"],
  ] as const;
  const shared = [
    ["shared-research", "Research Agent · fixture", "demo-mia", "OBSERVED", "EXTERNAL_PLATFORM"],
    ["shared-sales", "Sales Agent · fixture", "demo-elliott", "GOVERNED", "ANC_CONNECTOR"],
    ["shared-support", "Customer Support Agent · fixture", "demo-alex", "OBSERVED", "EXTERNAL_PLATFORM"],
    ["shared-finance", "Finance Agent · fixture", "demo-elliott", "GOVERNED", "ANC_CONNECTOR"],
  ] as const;
  const agents = [
    ...personal.map(([id, displayName, accountableHumanId, providerReference, runtimeReference]) =>
      validateAgentPortfolioRecord({
        id,
        companyId: input.companyId,
        displayName,
        accountableHumanId,
        providerReference,
        runtimeReference,
        source: {
          connectorId: "demo-inventory-connector",
          externalId: id,
          externalUrl: `https://demo.invalid/agents/${id}`,
        },
        permissionIds: ["enterprise-data-request-only"],
        dataAuthorizationIds: [],
        lifecycleStatus: "ACTIVE",
        connectorHealth: "HEALTHY",
        synchronizedAt: input.createdAt,
        agentClass: "PERSONAL",
        managementDepth: "INVENTORY",
        executionOwner: "HUMAN_ENDPOINT",
        workVisibility: "NONE",
        privacyBoundary: "PRIVATE_ACTIVITY_EXCLUDED",
      })
    ),
    ...shared.map(([id, displayName, accountableHumanId, managementDepth, executionOwner]) =>
      validateAgentPortfolioRecord({
        id,
        companyId: input.companyId,
        displayName,
        accountableHumanId,
        providerReference: "demo-provider-reference",
        runtimeReference: "demo-shared-runtime",
        source: {
          connectorId: managementDepth === "GOVERNED"
            ? "demo-governed-connector"
            : "demo-channel-connector",
          externalId: id,
          externalUrl: `https://demo.invalid/agents/${id}`,
        },
        permissionIds: managementDepth === "GOVERNED"
          ? ["permission-governed-action"]
          : ["permission-observe-summary"],
        dataAuthorizationIds: managementDepth === "GOVERNED"
          ? ["demo-governed-data"]
          : [],
        lifecycleStatus: "ACTIVE",
        connectorHealth: "HEALTHY",
        synchronizedAt: input.createdAt,
        agentClass: "SHARED",
        managementDepth,
        executionOwner,
        workVisibility: managementDepth === "GOVERNED"
          ? "GOVERNED_RECORD"
          : "SUMMARY_AND_REFERENCES",
        privacyBoundary: managementDepth === "GOVERNED"
          ? "GOVERNED_AUTHORITY_ONLY"
          : "BOUNDED_SOURCE_RECORDS",
      })
    ),
    validateAgentPortfolioRecord({
      id: "federated-workspace",
      companyId: input.companyId,
      displayName: "Enterprise Agent Workspace · deterministic fixture",
      accountableHumanId: "demo-elliott",
      providerReference: null,
      runtimeReference: "federated-runtime-reference",
      source: {
        connectorId: "demo-federated-connector",
        externalId: "external-workspace-one",
        externalUrl: "https://demo.invalid/workspaces/one",
      },
      permissionIds: ["permission-sync-references"],
      dataAuthorizationIds: [],
      lifecycleStatus: "ACTIVE",
      connectorHealth: "HEALTHY",
      synchronizedAt: input.createdAt,
      agentClass: "FEDERATED_RUNTIME",
      managementDepth: "FEDERATED",
      executionOwner: "EXTERNAL_PLATFORM",
      workVisibility: "SUMMARY_AND_REFERENCES",
      privacyBoundary: "BOUNDED_SOURCE_RECORDS",
    }),
  ];
  const work = [
    validateExternalWork({
      id: "observed-work-one",
      companyId: input.companyId,
      agentId: "shared-research",
      initiatedBy: "demo-mia",
      title: "Competitor research from a shared channel · fixture",
      summary: "Mia requested a bounded comparison in a shared channel.",
      status: "COMPLETED",
      source: {
        connectorId: "demo-channel-connector",
        externalId: "demo-thread-42",
        channelReference: "research-channel",
        threadReference: "thread-42",
        workspaceReference: null,
        returnUrl: "https://demo.invalid/channels/research/thread-42",
      },
      evidenceReferences: ["observed-evidence-reference"],
      resultReference: "observed-result-reference",
      costCents: 84,
      sourceRevision: 1,
      synchronizedAt: input.createdAt,
      provenance: "DEMO_FIXTURE",
    }, "OBSERVED"),
    validateExternalWork({
      id: "federated-work-one",
      companyId: input.companyId,
      agentId: "federated-workspace",
      initiatedBy: null,
      title: "Federated campaign analysis · fixture",
      summary: "A deterministic external workspace synchronized Run and Artifact references.",
      status: "COMPLETED",
      source: {
        connectorId: "demo-federated-connector",
        externalId: "external-run-17",
        channelReference: null,
        threadReference: null,
        workspaceReference: "external-workspace-one",
        returnUrl: "https://demo.invalid/workspaces/one/runs/17",
      },
      evidenceReferences: ["federated-evidence-reference"],
      resultReference: "federated-artifact-reference",
      costCents: 126,
      sourceRevision: 7,
      synchronizedAt: input.createdAt,
      provenance: "DEMO_FIXTURE",
    }, "FEDERATED"),
  ];
  const subscriptions = [
    validateAgentSubscription({
      id: "subscription-mia",
      companyId: input.companyId,
      agentId: "personal-mia",
      humanId: "demo-mia",
      providerReference: "anthropic-reference",
      planReference: "individual-plan-reference",
      status: "ACTIVE",
      seatCount: 1,
      quotaUnits: 1_000_000,
      quotaUnit: "TOKENS",
      periodCostCents: 2_000,
      renewalAt: "2026-09-27T00:00:00.000Z",
      sourceRevision: 1,
      synchronizedAt: input.createdAt,
      provenance: "DEMO_FIXTURE",
    }),
  ];
  const credentials = [
    validateAgentCredentialStatus({
      id: "credential-elliott",
      companyId: input.companyId,
      agentId: "personal-elliott",
      credentialReferenceId: "opaque-demo-reference",
      kind: "TOKEN",
      status: "EXPIRING",
      policyStatus: "COMPLIANT",
      expiresAt: "2026-09-02T00:00:00.000Z",
      verifiedAt: input.createdAt,
      sourceRevision: 1,
      provenance: "DEMO_FIXTURE",
    }),
  ];
  return {
    sessionId: input.sessionId,
    generation: input.generation,
    revision: input.revision,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    company: { id: input.companyId, name: "Coral Labs · Demo Fixture" },
    agents,
    work,
    commercial: {
      subscriptions,
      credentials,
      renewals: [],
      usage: [],
    },
    governed: {
      phase: "READY",
      approvalRequestId: null,
      evidenceReferences: [],
      resultReference: null,
      costCents: 0,
    },
    provenance: "DEMO_FIXTURE",
  };
};

