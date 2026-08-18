import type { Identifier } from "../core/control-plane.ts";
import type { AgentExecutionPort } from "../ports/agent-execution-port.ts";
import type {
  ApprovalPublicationPort,
  ApprovalRequest,
} from "../ports/approval-publication-port.ts";
import type { OrganizationPrincipalPort } from "../ports/organization-principal-port.ts";

export interface ControlPlaneSnapshotDependencies {
  readonly companyId: Identifier;
  readonly organizationPort: OrganizationPrincipalPort;
  readonly approvalPort: ApprovalPublicationPort;
  readonly executionPorts: readonly AgentExecutionPort[];
  readonly mode: "PRODUCTION" | "DEMO_FIXTURE";
}

export interface ConnectorSnapshot {
  readonly connectorId: Identifier;
  readonly provider: string;
  readonly health: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly isFixture: boolean;
}

export interface ControlPlaneSnapshot {
  readonly company: { readonly id: Identifier; readonly name: string };
  readonly connectors: readonly ConnectorSnapshot[];
  readonly approvals: readonly ApprovalRequest[];
  readonly mode: "PRODUCTION" | "DEMO_FIXTURE";
  readonly notice: string;
}

export class GetControlPlaneSnapshot {
  readonly #dependencies: ControlPlaneSnapshotDependencies;

  constructor(dependencies: ControlPlaneSnapshotDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(): Promise<ControlPlaneSnapshot> {
    const organization = await this.#dependencies.organizationPort.getOrganization(
      this.#dependencies.companyId,
    );
    if (!organization) throw new Error("Organization was not found.");

    const connectors = await Promise.all(
      this.#dependencies.executionPorts.map(async (port) => {
        const [capabilities, health] = await Promise.all([
          port.capabilities(),
          port.health(),
        ]);
        return {
          connectorId: capabilities.connectorId,
          provider: capabilities.displayName,
          health,
          isFixture: this.#dependencies.mode === "DEMO_FIXTURE",
        };
      }),
    );

    return {
      company: {
        id: organization.company.id,
        name: organization.company.name,
      },
      connectors,
      approvals: await this.#dependencies.approvalPort.pending(
        this.#dependencies.companyId,
      ),
      mode: this.#dependencies.mode,
      notice: this.#dependencies.mode === "DEMO_FIXTURE"
        ? "Deterministic fixture only — no real agent, model, credential, or company data."
        : "Production control-plane data.",
    };
  }
}

