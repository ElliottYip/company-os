import type { Identifier } from "../../core/control-plane.ts";
import type {
  CancelGenericRunCommand,
  CreateGenericWorkCommand,
  GenericRunEvent,
  GenericRunEventPage,
  GenericWorkPage,
  GenericWorkPort,
  GenericWorkRecord,
  GenericWorkResult,
  GenericWorkStatus,
} from "../../ports/generic-work-port.ts";
import { normalizePaperclipError } from "./error-contract.ts";

export type PaperclipResourceKind = "company" | "agent" | "goal" | "work" | "run" | "run-work";

export interface PaperclipResourceMap {
  getUpstreamId(kind: PaperclipResourceKind, companyOsId: Identifier): Promise<string | null>;
  getCompanyOsId(kind: PaperclipResourceKind, upstreamId: string): Promise<Identifier | null>;
  bind(kind: PaperclipResourceKind, companyOsId: Identifier, upstreamId: string): Promise<void>;
}

export interface PaperclipHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface PaperclipHttpTransport {
  request(input: {
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly body?: unknown;
  }): Promise<PaperclipHttpResponse>;
}

interface PaperclipIssueDto {
  readonly id: string;
  readonly companyId: string;
  readonly goalId: string | null;
  readonly assigneeAgentId: string | null;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PaperclipRunEventDto {
  readonly seq: number;
  readonly runId: string;
  readonly eventType: string;
  readonly stream: "system" | "stdout" | "stderr" | null;
  readonly level: "info" | "warn" | "error" | null;
  readonly createdAt: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] : null;
}

function nullableStringField(value: Record<string, unknown>, key: string): string | null | undefined {
  return value[key] === null ? null : typeof value[key] === "string" ? value[key] : undefined;
}

function parseIssue(value: unknown): PaperclipIssueDto | null {
  if (!isObject(value)) return null;
  const id = stringField(value, "id");
  const companyId = stringField(value, "companyId");
  const title = stringField(value, "title");
  const status = stringField(value, "status");
  const createdAt = stringField(value, "createdAt");
  const updatedAt = stringField(value, "updatedAt");
  const goalId = nullableStringField(value, "goalId");
  const assigneeAgentId = nullableStringField(value, "assigneeAgentId");
  if (!id || !companyId || !title || !status || !createdAt || !updatedAt) return null;
  if (goalId === undefined || assigneeAgentId === undefined) return null;
  return { id, companyId, title, status, createdAt, updatedAt, goalId, assigneeAgentId };
}

function parseRunEvent(value: unknown): PaperclipRunEventDto | null {
  if (!isObject(value)) return null;
  const seq = value.seq;
  const runId = stringField(value, "runId");
  const eventType = stringField(value, "eventType");
  const createdAt = stringField(value, "createdAt");
  const stream = value.stream;
  const level = value.level;
  if (!Number.isInteger(seq) || (seq as number) < 0 || !runId || !eventType || !createdAt) return null;
  if (stream !== null && stream !== "system" && stream !== "stdout" && stream !== "stderr") return null;
  if (level !== null && level !== "info" && level !== "warn" && level !== "error") return null;
  return { seq: seq as number, runId, eventType, createdAt, stream, level };
}

function statusFromPaperclip(status: string): GenericWorkStatus | null {
  switch (status) {
    case "backlog": return "PENDING";
    case "todo": return "READY";
    case "in_progress": return "RUNNING";
    case "in_review": return "AWAITING_APPROVAL";
    case "done": return "SUCCEEDED";
    case "blocked": return "PAUSED";
    case "cancelled": return "CANCELLED";
    default: return null;
  }
}

function contractFailure<T>(code: string): GenericWorkResult<T> {
  return {
    ok: false,
    error: {
      code,
      category: "UPSTREAM_UNAVAILABLE",
      retryable: false,
    },
  };
}

function mappingFailure<T>(kind: PaperclipResourceKind): GenericWorkResult<T> {
  return {
    ok: false,
    error: {
      code: `UPSTREAM_${kind.toUpperCase()}_MAPPING_MISSING`,
      category: "NOT_FOUND",
      retryable: false,
    },
  };
}

function parseOffset(cursor: string | undefined): number | null {
  if (cursor === undefined) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : null;
}

export class PaperclipGenericWorkAdapter implements GenericWorkPort {
  readonly #transport: PaperclipHttpTransport;
  readonly #resources: PaperclipResourceMap;

  constructor(dependencies: {
    readonly transport: PaperclipHttpTransport;
    readonly resources: PaperclipResourceMap;
  }) {
    this.#transport = dependencies.transport;
    this.#resources = dependencies.resources;
  }

  async createWork(command: CreateGenericWorkCommand): Promise<GenericWorkResult<GenericWorkRecord>> {
    const companyId = await this.#resources.getUpstreamId("company", command.companyId);
    if (!companyId) return mappingFailure("company");
    const goalId = command.goalId
      ? await this.#resources.getUpstreamId("goal", command.goalId)
      : null;
    if (command.goalId && !goalId) return mappingFailure("goal");
    const assigneeAgentId = command.assigneeId
      ? await this.#resources.getUpstreamId("agent", command.assigneeId)
      : null;
    if (command.assigneeId && !assigneeAgentId) return mappingFailure("agent");

    const response = await this.#transport.request({
      method: "POST",
      path: `/api/companies/${encodeURIComponent(companyId)}/issues`,
      body: {
        title: command.title,
        description: command.description,
        goalId,
        assigneeAgentId,
        idempotencyKey: command.idempotencyKey,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: normalizePaperclipError(response.status, response.body) };
    }
    const issue = parseIssue(response.body);
    if (!issue || issue.companyId !== companyId) return contractFailure("UPSTREAM_ISSUE_CONTRACT_INVALID");
    await this.#resources.bind("work", command.id, issue.id);
    return this.#toWork(command.companyId, command.id, issue);
  }

  async getWork(companyId: Identifier, workId: Identifier): Promise<GenericWorkResult<GenericWorkRecord>> {
    const upstreamCompanyId = await this.#resources.getUpstreamId("company", companyId);
    if (!upstreamCompanyId) return mappingFailure("company");
    const upstreamWorkId = await this.#resources.getUpstreamId("work", workId);
    if (!upstreamWorkId) return mappingFailure("work");
    const response = await this.#transport.request({
      method: "GET",
      path: `/api/issues/${encodeURIComponent(upstreamWorkId)}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: normalizePaperclipError(response.status, response.body) };
    }
    const issue = parseIssue(response.body);
    if (!issue || issue.companyId !== upstreamCompanyId) return contractFailure("UPSTREAM_ISSUE_CONTRACT_INVALID");
    return this.#toWork(companyId, workId, issue);
  }

  async listWork(query: {
    readonly companyId: Identifier;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<GenericWorkResult<GenericWorkPage>> {
    const upstreamCompanyId = await this.#resources.getUpstreamId("company", query.companyId);
    if (!upstreamCompanyId) return mappingFailure("company");
    const offset = parseOffset(query.cursor);
    if (offset === null || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200) {
      return {
        ok: false,
        error: { code: "INVALID_PAGINATION", category: "INVALID_REQUEST", retryable: false },
      };
    }
    const response = await this.#transport.request({
      method: "GET",
      path: `/api/companies/${encodeURIComponent(upstreamCompanyId)}/issues?limit=${query.limit}&offset=${offset}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: normalizePaperclipError(response.status, response.body) };
    }
    if (!Array.isArray(response.body)) return contractFailure("UPSTREAM_ISSUE_LIST_CONTRACT_INVALID");
    const records: GenericWorkRecord[] = [];
    for (const raw of response.body) {
      const issue = parseIssue(raw);
      if (!issue || issue.companyId !== upstreamCompanyId) {
        return contractFailure("UPSTREAM_ISSUE_LIST_CONTRACT_INVALID");
      }
      const workId = await this.#resources.getCompanyOsId("work", issue.id);
      if (!workId) continue;
      const mapped = await this.#toWork(query.companyId, workId, issue);
      if (!mapped.ok) return mapped;
      records.push(mapped.value);
    }
    return {
      ok: true,
      value: {
        items: records,
        nextCursor: response.body.length === query.limit ? `offset:${offset + query.limit}` : null,
      },
    };
  }

  async cancelRun(command: CancelGenericRunCommand): Promise<GenericWorkResult<void>> {
    const upstreamCompanyId = await this.#resources.getUpstreamId("company", command.companyId);
    if (!upstreamCompanyId) return mappingFailure("company");
    const upstreamRunId = await this.#resources.getUpstreamId("run", command.runId);
    if (!upstreamRunId) return mappingFailure("run");
    const response = await this.#transport.request({
      method: "POST",
      path: `/api/heartbeat-runs/${encodeURIComponent(upstreamRunId)}/cancel`,
      body: {},
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: normalizePaperclipError(response.status, response.body) };
    }
    return { ok: true, value: undefined };
  }

  async listRunEvents(query: {
    readonly companyId: Identifier;
    readonly runId: Identifier;
    readonly afterSequence: number;
    readonly limit: number;
  }): Promise<GenericWorkResult<GenericRunEventPage>> {
    const upstreamCompanyId = await this.#resources.getUpstreamId("company", query.companyId);
    if (!upstreamCompanyId) return mappingFailure("company");
    const upstreamRunId = await this.#resources.getUpstreamId("run", query.runId);
    if (!upstreamRunId) return mappingFailure("run");
    if (!Number.isInteger(query.afterSequence) || query.afterSequence < 0 ||
        !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 500) {
      return {
        ok: false,
        error: { code: "INVALID_EVENT_WINDOW", category: "INVALID_REQUEST", retryable: false },
      };
    }
    const response = await this.#transport.request({
      method: "GET",
      path: `/api/heartbeat-runs/${encodeURIComponent(upstreamRunId)}/events?afterSeq=${query.afterSequence}&limit=${query.limit}`,
    });
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: normalizePaperclipError(response.status, response.body) };
    }
    if (!Array.isArray(response.body)) return contractFailure("UPSTREAM_RUN_EVENT_CONTRACT_INVALID");
    const events: GenericRunEvent[] = [];
    for (const raw of response.body) {
      const event = parseRunEvent(raw);
      if (!event || event.runId !== upstreamRunId) return contractFailure("UPSTREAM_RUN_EVENT_CONTRACT_INVALID");
      events.push({
        sequence: event.seq,
        runId: query.runId,
        workId: await this.#workIdForRun(upstreamRunId, query.runId),
        type: event.eventType,
        occurredAt: event.createdAt,
        attributes: {
          ...(event.stream ? { stream: event.stream } : {}),
          ...(event.level ? { level: event.level } : {}),
        },
      });
    }
    const last = events.at(-1)?.sequence ?? null;
    return {
      ok: true,
      value: {
        items: events,
        nextSequence: response.body.length === query.limit ? last : null,
      },
    };
  }

  async #toWork(
    companyId: Identifier,
    workId: Identifier,
    issue: PaperclipIssueDto,
  ): Promise<GenericWorkResult<GenericWorkRecord>> {
    const status = statusFromPaperclip(issue.status);
    if (!status) return contractFailure("UPSTREAM_ISSUE_STATUS_UNSUPPORTED");
    const goalId = issue.goalId
      ? await this.#resources.getCompanyOsId("goal", issue.goalId)
      : null;
    const assigneeId = issue.assigneeAgentId
      ? await this.#resources.getCompanyOsId("agent", issue.assigneeAgentId)
      : null;
    return {
      ok: true,
      value: {
        id: workId,
        companyId,
        title: issue.title,
        goalId,
        assigneeId,
        status,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      },
    };
  }

  async #workIdForRun(upstreamRunId: string, fallbackRunId: Identifier): Promise<Identifier> {
    // Run-to-work binding is created when controlled dispatch is admitted.
    // Until then a run may use the same opaque ID without exposing upstream IDs.
    return await this.#resources.getCompanyOsId("run-work", upstreamRunId) ?? fallbackRunId;
  }
}
