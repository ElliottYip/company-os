import type {
  AgentDeployment,
  AgentExecutionCapabilities,
  AgentExecutionPort,
  RuntimeProof,
} from "../../ports/agent-execution-port.ts";
import type {
  AgentDescriptor,
  Identifier,
  WorkObservation,
  WorkRequest,
} from "../../core/control-plane.ts";
import type {
  ApprovalDecision,
  ApprovalPublicationPort,
  ApprovalRequest,
} from "../../ports/approval-publication-port.ts";
import type { OrganizationPrincipalPort } from "../../ports/organization-principal-port.ts";
import type { ControlPlaneSnapshotDependencies } from "../../application/get-control-plane-snapshot.ts";

class DemoExecutionAdapter implements AgentExecutionPort {
  readonly #capabilities: AgentExecutionCapabilities;

  constructor(connectorId: string, displayName: string) {
    this.#capabilities = {
      connectorId,
      displayName,
      protocolVersion: "1.0",
      supportsPause: true,
      supportsResume: true,
      supportsCancellation: true,
      supportsEvidence: true,
      maximumTimeoutSeconds: 300,
    };
  }

  async capabilities(): Promise<AgentExecutionCapabilities> {
    return this.#capabilities;
  }

  async health(): Promise<"HEALTHY"> {
    return "HEALTHY";
  }

  async deploy(agent: AgentDescriptor): Promise<AgentDeployment> {
    return {
      id: `fixture-deployment-${agent.id}`,
      agentId: agent.id,
      connectorId: this.#capabilities.connectorId,
    };
  }

  async submit(
    _deployment: AgentDeployment,
    request: WorkRequest,
    _proof: RuntimeProof,
  ): Promise<{ readonly accepted: true; readonly executionId: Identifier }> {
    return { accepted: true, executionId: `fixture-execution-${request.id}` };
  }

  async observe(_workId: Identifier): Promise<readonly WorkObservation[]> {
    return [];
  }

  async pause(_workId: Identifier, _reason: string): Promise<void> {}
  async resume(_workId: Identifier, _approvalId: Identifier): Promise<void> {}
  async cancel(_workId: Identifier, _reason: string): Promise<void> {}
}

class DemoApprovalAdapter implements ApprovalPublicationPort {
  readonly #requests: ApprovalRequest[];
  readonly #decisions = new Map<Identifier, ApprovalDecision>();

  constructor(requests: readonly ApprovalRequest[]) {
    this.#requests = [...requests];
  }

  async publishRequest(input: ApprovalRequest): Promise<void> {
    this.#requests.push(input);
  }

  async pending(companyId: Identifier): Promise<readonly ApprovalRequest[]> {
    return this.#requests.filter(({ companyId: value }) => value === companyId);
  }

  async publishDecision(decision: ApprovalDecision): Promise<void> {
    this.#decisions.set(decision.requestId, decision);
  }

  async decision(requestId: Identifier): Promise<ApprovalDecision | null> {
    return this.#decisions.get(requestId) ?? null;
  }
}

const demoOrganization = {
  company: {
    id: "demo-company",
    name: "珊瑚实验室",
    purpose: "确定性 Company OS 演示公司",
    locale: "zh-CN",
  },
  departments: [{ id: "operations", name: "运营部", mandate: "安全交付" }],
  humans: [{
    id: "demo-boss",
    name: "林澄",
    title: "Agent Boss（演示）",
    departmentId: "operations",
    avatarId: "clay-human-placeholder",
  }],
  agents: [{
    id: "demo-researcher",
    name: "市场研究员（演示）",
    role: "形成带证据的市场简报",
    departmentId: "operations",
    accountableHumanId: "demo-boss",
    runtimeConnectorId: "fixture-codex",
    avatarId: "fish-bumble",
    autonomyLevel: 2,
  }],
} as const;

const organizationPort: OrganizationPrincipalPort = {
  async getOrganization(companyId) {
    return companyId === demoOrganization.company.id ? demoOrganization : null;
  },
  async listPrincipals() {
    return [{ id: "demo-boss", kind: "HUMAN", displayName: "林澄" }];
  },
};

const approvalRequest: ApprovalRequest = {
  id: "fixture-approval-publish",
  companyId: "demo-company",
  binding: {
    action: {
      id: "fixture-action-publish",
      type: "publish-content",
      description: "发布演示市场简报",
      inputDigest: "sha256:fixture-action-digest",
      risk: "HIGH",
    },
    workId: "fixture-work-market-brief",
    responsibilityContractId: "fixture-contract-researcher",
    executingAgentId: "demo-researcher",
    accountableHumanId: "demo-boss",
    evidenceReferences: ["fixture-evidence-plan"],
    resultReference: "fixture-result-market-brief",
  },
  requestedAt: "2026-08-18T08:02:00.000Z",
  expiresAt: "2026-08-18T08:07:00.000Z",
  status: "AWAITING_APPROVAL",
};

export function createDemoPorts(): ControlPlaneSnapshotDependencies {
  return {
    companyId: "demo-company",
    organizationPort,
    approvalPort: new DemoApprovalAdapter([approvalRequest]),
    executionPorts: [
      new DemoExecutionAdapter("fixture-raft-agent", "Raft Agent"),
      new DemoExecutionAdapter("fixture-codex", "Codex"),
      new DemoExecutionAdapter("fixture-deepseek", "DeepSeek"),
      new DemoExecutionAdapter("fixture-enterprise", "Enterprise Agent"),
    ],
    mode: "DEMO_FIXTURE",
  };
}

