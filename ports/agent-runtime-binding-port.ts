import type {
  AgentRuntimeBinding,
  AgentRuntimeBindingSnapshot,
} from "../core/agent-runtime-binding.ts";
import type { CompanyStructure } from "../core/company-structure.ts";
import type { Identifier } from "../core/control-plane.ts";
import type { ResponsibilityContractSnapshot } from "./responsibility-contract-port.ts";

export interface RecordAgentRuntimeBindingCommand {
  readonly companyId: Identifier;
  readonly actorId: Identifier;
  readonly occurredAt: string;
  readonly expectedSnapshotRevision: number;
  readonly structure: CompanyStructure;
  readonly responsibilitySnapshot: ResponsibilityContractSnapshot;
  readonly snapshot: AgentRuntimeBindingSnapshot;
  readonly change: AgentRuntimeBinding;
}

export interface AgentRuntimeBindingPort {
  load(companyId: Identifier): Promise<AgentRuntimeBindingSnapshot>;
  record(command: RecordAgentRuntimeBindingCommand): Promise<AgentRuntimeBindingSnapshot>;
}
