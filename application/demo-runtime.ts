export type DemoPhase =
  | "READY"
  | "PLANNING"
  | "SIMULATING_TOOL_ACTIVITY"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "REJECTED";

export interface DemoEvent {
  readonly id: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly summary: string;
  readonly isFixture: true;
}

export interface DemoResponsibilityChain {
  readonly workId: string;
  readonly goalInitiatorId: string;
  readonly accountableHumanId: string;
  readonly executingAgentId: string;
  readonly permissionIds: readonly string[];
  readonly dataAuthorizationIds: readonly string[];
  readonly approvalIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly resultId: string | null;
}

export interface DemoState {
  readonly mode: "DEMO_FIXTURE";
  readonly phase: DemoPhase;
  readonly events: readonly DemoEvent[];
  readonly responsibility: DemoResponsibilityChain;
}

const INITIAL_STATE: DemoState = {
  mode: "DEMO_FIXTURE",
  phase: "READY",
  events: [],
  responsibility: {
    workId: "demo-work-001",
    goalInitiatorId: "demo-boss",
    accountableHumanId: "demo-boss",
    executingAgentId: "demo-researcher",
    permissionIds: ["permission-read-demo", "permission-publish-demo"],
    dataAuthorizationIds: ["data-contract-demo-market"],
    approvalIds: [],
    evidenceIds: [],
    resultId: null,
  },
};

const timestamps = [
  "2026-08-18T08:00:00.000Z",
  "2026-08-18T08:00:20.000Z",
  "2026-08-18T08:00:40.000Z",
  "2026-08-18T08:01:00.000Z",
  "2026-08-18T08:01:20.000Z",
  "2026-08-18T08:01:40.000Z",
] as const;

function copyState(state: DemoState): DemoState {
  return {
    ...state,
    events: state.events.map((event) => ({ ...event })),
    responsibility: {
      ...state.responsibility,
      permissionIds: [...state.responsibility.permissionIds],
      dataAuthorizationIds: [...state.responsibility.dataAuthorizationIds],
      approvalIds: [...state.responsibility.approvalIds],
      evidenceIds: [...state.responsibility.evidenceIds],
    },
  };
}

function fixtureEvent(
  sequence: number,
  type: string,
  summary: string,
): DemoEvent {
  return {
    id: `demo-event-${String(sequence).padStart(3, "0")}`,
    type,
    occurredAt: timestamps[sequence - 1] ?? timestamps.at(-1)!,
    summary,
    isFixture: true,
  };
}

export interface DemoRuntime {
  snapshot(): DemoState;
  assignTask(): DemoState;
  advance(): DemoState;
  decide(decision: "APPROVED" | "REJECTED"): DemoState;
  reset(): DemoState;
}

export function createDemoRuntime(): DemoRuntime {
  let state = copyState(INITIAL_STATE);

  function append(
    phase: DemoPhase,
    type: string,
    summary: string,
    responsibility: DemoResponsibilityChain = state.responsibility,
  ): DemoState {
    state = {
      ...state,
      phase,
      events: [...state.events, fixtureEvent(state.events.length + 1, type, summary)],
      responsibility,
    };
    return copyState(state);
  }

  return {
    snapshot() {
      return copyState(state);
    },
    assignTask() {
      if (state.phase !== "READY") throw new Error("Demo task is already assigned.");
      return append("PLANNING", "work.assigned", "Agent Boss 分配演示市场简报任务");
    },
    advance() {
      if (state.phase === "PLANNING") {
        return append(
          "SIMULATING_TOOL_ACTIVITY",
          "plan.recorded",
          "演示 Agent 形成确定性三步计划",
          {
            ...state.responsibility,
            evidenceIds: ["demo-evidence-plan"],
          },
        );
      }
      if (state.phase === "SIMULATING_TOOL_ACTIVITY" && state.events.length === 2) {
        return append(
          "SIMULATING_TOOL_ACTIVITY",
          "tool.activity.simulated",
          "模拟读取获准的演示市场数据",
          {
            ...state.responsibility,
            evidenceIds: ["demo-evidence-plan", "demo-evidence-tool"],
          },
        );
      }
      if (state.phase === "SIMULATING_TOOL_ACTIVITY") {
        return append(
          "AWAITING_APPROVAL",
          "approval.requested",
          "高风险发布动作已暂停，等待真人决定",
          {
            ...state.responsibility,
            approvalIds: ["demo-approval-001"],
          },
        );
      }
      throw new Error(`Demo cannot advance from ${state.phase}.`);
    },
    decide(decision) {
      if (state.phase !== "AWAITING_APPROVAL") {
        throw new Error("Demo has no pending approval.");
      }
      if (decision === "REJECTED") {
        return append(
          "REJECTED",
          "approval.rejected",
          "真人拒绝了演示发布动作",
        );
      }
      return append(
        "COMPLETED",
        "work.completed",
        "真人批准后形成演示结果与完整责任链",
        {
          ...state.responsibility,
          evidenceIds: [
            ...state.responsibility.evidenceIds,
            "demo-evidence-result",
          ],
          resultId: "demo-result-001",
        },
      );
    },
    reset() {
      state = copyState(INITIAL_STATE);
      return copyState(state);
    },
  };
}

