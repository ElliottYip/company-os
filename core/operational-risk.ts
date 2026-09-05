import type { Identifier } from "./control-plane.ts";

export type RuntimeSpanKind = "WORKFLOW" | "MODEL" | "TOOL" | "DATA";
export type RuntimeResourceType = "MODEL" | "TOOL" | "DATA" | "ASSET";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RuntimeTraceResource {
  readonly type: RuntimeResourceType;
  readonly id: Identifier;
  readonly operation: string;
  readonly authorityId: Identifier;
}

export interface RuntimeSpan {
  readonly id: Identifier;
  readonly parentSpanId: Identifier | null;
  readonly kind: RuntimeSpanKind;
  readonly name: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly status: "OK" | "ERROR";
  readonly resource: RuntimeTraceResource | null;
}

export interface RuntimeTrace {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly workId: Identifier;
  readonly attemptId: Identifier;
  readonly agentId: Identifier;
  readonly spans: readonly RuntimeSpan[];
  readonly recordedAt: string;
}

export interface AccessMapEdge {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly traceId: Identifier;
  readonly spanId: Identifier;
  readonly subjectAgentId: Identifier;
  readonly resourceType: RuntimeResourceType;
  readonly resourceId: Identifier;
  readonly operation: string;
  readonly authorityId: Identifier;
}

export interface OperationalRiskRule {
  readonly id: Identifier;
  readonly resourceType: RuntimeResourceType;
  readonly resourceId: Identifier;
  readonly operation?: string;
  readonly severity: RiskSeverity;
  readonly summary: string;
}

export interface PolicyViolation {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly ruleId: Identifier;
  readonly severity: RiskSeverity;
  readonly agentId: Identifier;
  readonly workId: Identifier;
  readonly attemptId: Identifier;
  readonly traceId: Identifier;
  readonly accessEdgeIds: readonly Identifier[];
  readonly summary: string;
  readonly observedAt: string;
}

export type RiskContainment = "NOT_REQUIRED" | "UNSUPPORTED" | "PAUSE_REQUESTED" | "PAUSE_SUCCEEDED" | "PAUSE_FAILED";

export interface RiskAlert {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly violationId: Identifier;
  readonly severity: RiskSeverity;
  readonly status: "OPEN" | "CONTAINED" | "RESOLVED";
  readonly containment: RiskContainment;
  readonly openedAt: string;
  readonly resolvedAt: string | null;
}

export type AiCaseStatus = "OPEN" | "CONTAINED" | "INVESTIGATING" | "REMEDIATING" | "REVIEW" | "RECOVERY_REQUESTED" | "RECOVERED" | "CLOSED";

export interface AiCase {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly alertIds: readonly Identifier[];
  readonly workId: Identifier;
  readonly agentId: Identifier;
  readonly accountableHumanId: Identifier;
  readonly ownerHumanId: Identifier;
  readonly status: AiCaseStatus;
  readonly revision: number;
  readonly containment: RiskContainment;
  readonly summary: string;
  readonly rootCause: string | null;
  readonly remediation: string | null;
  readonly prevention: string | null;
  readonly openedAt: string;
  readonly updatedAt: string;
  readonly closedAt: string | null;
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const OPERATION = /^[A-Z][A-Z0-9:_-]{0,63}$/;

function id(value: unknown, code: string): Identifier {
  if (typeof value !== "string" || !ID.test(value)) throw new Error(code);
  return value;
}

function instant(value: unknown, code: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return value;
}

function text(value: unknown, limit: number, code: string): string {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > limit) throw new Error(code);
  return value.trim();
}

export function validateRuntimeTrace(value: RuntimeTrace): RuntimeTrace {
  id(value.id, "RUNTIME_TRACE_ID_INVALID"); id(value.companyId, "RUNTIME_TRACE_COMPANY_INVALID");
  id(value.workId, "RUNTIME_TRACE_WORK_INVALID"); id(value.attemptId, "RUNTIME_TRACE_ATTEMPT_INVALID");
  id(value.agentId, "RUNTIME_TRACE_AGENT_INVALID");
  const recordedAt = instant(value.recordedAt, "RUNTIME_TRACE_TIME_INVALID");
  if (!Array.isArray(value.spans) || !value.spans.length || value.spans.length > 256) {
    throw new Error("RUNTIME_TRACE_SPANS_INVALID");
  }
  const ids = new Set<string>();
  for (const span of value.spans) {
    id(span.id, "RUNTIME_TRACE_SPAN_ID_INVALID");
    if (ids.has(span.id)) throw new Error("RUNTIME_TRACE_SPAN_ID_INVALID");
    ids.add(span.id);
    if (span.parentSpanId !== null) id(span.parentSpanId, "RUNTIME_TRACE_PARENT_INVALID");
    if (!["WORKFLOW", "MODEL", "TOOL", "DATA"].includes(span.kind) || !["OK", "ERROR"].includes(span.status)) {
      throw new Error("RUNTIME_TRACE_SPAN_INVALID");
    }
    text(span.name, 160, "RUNTIME_TRACE_SPAN_INVALID");
    const startedAt = instant(span.startedAt, "RUNTIME_TRACE_SPAN_TIME_INVALID");
    const endedAt = instant(span.endedAt, "RUNTIME_TRACE_SPAN_TIME_INVALID");
    if (Date.parse(endedAt) < Date.parse(startedAt) || Date.parse(endedAt) > Date.parse(recordedAt)) {
      throw new Error("RUNTIME_TRACE_SPAN_TIME_INVALID");
    }
    if (span.resource !== null) {
      if (!span.resource || Object.keys(span.resource).some((key) =>
        !["type", "id", "operation", "authorityId"].includes(key)) ||
        !["MODEL", "TOOL", "DATA", "ASSET"].includes(span.resource.type) ||
        !OPERATION.test(span.resource.operation)) throw new Error("RUNTIME_TRACE_RESOURCE_INVALID");
      id(span.resource.id, "RUNTIME_TRACE_RESOURCE_INVALID");
      id(span.resource.authorityId, "RUNTIME_TRACE_RESOURCE_INVALID");
    }
  }
  for (const span of value.spans) {
    if (span.parentSpanId !== null && !ids.has(span.parentSpanId)) throw new Error("RUNTIME_TRACE_PARENT_INVALID");
    const visited = new Set<string>([span.id]);
    let parent = span.parentSpanId;
    while (parent !== null) {
      if (visited.has(parent)) throw new Error("RUNTIME_TRACE_PARENT_INVALID");
      visited.add(parent);
      parent = value.spans.find(({ id: spanId }) => spanId === parent)?.parentSpanId ?? null;
    }
  }
  return structuredClone(value);
}

export function evaluateOperationalRisk(
  trace: RuntimeTrace,
  rules: readonly OperationalRiskRule[],
  nextId: () => Identifier,
): { readonly accessEdges: readonly AccessMapEdge[]; readonly violations: readonly PolicyViolation[] } {
  const admitted = validateRuntimeTrace(trace);
  const accessEdges = admitted.spans.flatMap((span): AccessMapEdge[] => span.resource ? [{
    id: nextId(), companyId: admitted.companyId, traceId: admitted.id, spanId: span.id,
    subjectAgentId: admitted.agentId, resourceType: span.resource.type, resourceId: span.resource.id,
    operation: span.resource.operation, authorityId: span.resource.authorityId,
  }] : []);
  const violations: PolicyViolation[] = [];
  for (const rule of rules) {
    id(rule.id, "OPERATIONAL_RISK_RULE_INVALID");
    text(rule.summary, 500, "OPERATIONAL_RISK_RULE_INVALID");
    const matching = accessEdges.filter((edge) => edge.resourceType === rule.resourceType &&
      edge.resourceId === rule.resourceId && (rule.operation === undefined || edge.operation === rule.operation));
    if (matching.length) violations.push({
      id: nextId(), companyId: admitted.companyId, ruleId: rule.id, severity: rule.severity,
      agentId: admitted.agentId, workId: admitted.workId, attemptId: admitted.attemptId,
      traceId: admitted.id, accessEdgeIds: matching.map(({ id }) => id), summary: rule.summary.trim(),
      observedAt: admitted.recordedAt,
    });
  }
  return { accessEdges, violations };
}

export type AiCaseOperation = "CONFIRM_CONTAINMENT" | "START_INVESTIGATION" | "START_REMEDIATION" |
  "REQUEST_REVIEW" | "RECOVER" | "CLOSE" | "REOPEN";

export interface AiCaseTransition {
  readonly operation: AiCaseOperation;
  readonly expectedRevision: number;
  readonly actorId: Identifier;
  readonly reason: string;
  readonly rootCause?: string;
  readonly remediation?: string;
  readonly prevention?: string;
  readonly occurredAt: string;
}

export function transitionAiCase(current: AiCase, command: AiCaseTransition): AiCase {
  if (current.revision !== command.expectedRevision) throw new Error("AI_CASE_REVISION_CONFLICT");
  id(command.actorId, "AI_CASE_ACTOR_INVALID");
  text(command.reason, 1_000, "AI_CASE_REASON_INVALID");
  const occurredAt = instant(command.occurredAt, "AI_CASE_TIME_INVALID");
  const allowed: Record<AiCaseOperation, readonly AiCaseStatus[]> = {
    CONFIRM_CONTAINMENT: ["OPEN"], START_INVESTIGATION: ["CONTAINED"],
    START_REMEDIATION: ["INVESTIGATING"], REQUEST_REVIEW: ["REMEDIATING"],
    RECOVER: ["REVIEW"], CLOSE: ["RECOVERED"], REOPEN: ["CLOSED"],
  };
  if (!allowed[command.operation].includes(current.status)) throw new Error("AI_CASE_TRANSITION_INVALID");
  if (command.operation === "START_REMEDIATION" && !command.rootCause) throw new Error("AI_CASE_ROOT_CAUSE_REQUIRED");
  if (command.operation === "REQUEST_REVIEW" && (!command.remediation || !command.prevention)) {
    throw new Error("AI_CASE_REVIEW_EVIDENCE_REQUIRED");
  }
  const status: Record<AiCaseOperation, AiCaseStatus> = {
    CONFIRM_CONTAINMENT: "CONTAINED", START_INVESTIGATION: "INVESTIGATING",
    START_REMEDIATION: "REMEDIATING", REQUEST_REVIEW: "REVIEW", RECOVER: "RECOVERY_REQUESTED",
    CLOSE: "CLOSED", REOPEN: "OPEN",
  };
  return {
    ...current, status: status[command.operation], revision: current.revision + 1,
    rootCause: command.rootCause ? text(command.rootCause, 2_000, "AI_CASE_ROOT_CAUSE_INVALID") : current.rootCause,
    remediation: command.remediation ? text(command.remediation, 2_000, "AI_CASE_REMEDIATION_INVALID") : current.remediation,
    prevention: command.prevention ? text(command.prevention, 2_000, "AI_CASE_PREVENTION_INVALID") : current.prevention,
    updatedAt: occurredAt, closedAt: command.operation === "CLOSE" ? occurredAt : command.operation === "REOPEN" ? null : current.closedAt,
  };
}
