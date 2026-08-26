import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";

export interface DeploymentDrainCompanySource {
  readonly companyId: Identifier;
  readonly eventSequence: number;
  readonly pendingPublicationCount: number;
  readonly events: readonly CompanyDomainEvent[];
}

/** Read-only production state needed to prove a planned restart is drained. */
export interface DeploymentDrainStatePort {
  capture(): Promise<readonly DeploymentDrainCompanySource[]>;
}
