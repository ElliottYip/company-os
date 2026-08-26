import type {
  AgentLifecycleOperation,
  AgentLifecycleRecord,
  AgentLifecycleSnapshot,
} from "../core/agent-lifecycle.ts";
import type { Identifier } from "../core/control-plane.ts";

export interface TransitionAgentLifecycleCommand {
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly actorId: Identifier;
  readonly operation: AgentLifecycleOperation;
  readonly pauseReason?: AgentLifecycleRecord["pauseReason"];
  readonly occurredAt: string;
  readonly expectedRevision: number;
}

export interface AgentLifecyclePort {
  load(companyId: Identifier): Promise<AgentLifecycleSnapshot>;
  transition(command: TransitionAgentLifecycleCommand): Promise<AgentLifecycleSnapshot>;
}
