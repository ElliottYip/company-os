import type { CompanyDomainEvent, Identifier, WorkStatus } from "./control-plane.ts";

export type PortfolioWorkMode = "OBSERVED" | "GOVERNED" | "FEDERATED";

export interface ExternalWorkSource {
  readonly connectorId: Identifier;
  readonly externalId: string;
  readonly channelReference: string | null;
  readonly threadReference: string | null;
  readonly workspaceReference: string | null;
  readonly returnUrl: string | null;
}

export interface ExternalWorkInput {
  readonly id: Identifier;
  readonly companyId: Identifier;
  readonly agentId: Identifier;
  readonly initiatedBy: Identifier | null;
  readonly title: string;
  readonly summary: string;
  readonly status: WorkStatus;
  readonly source: ExternalWorkSource;
  readonly evidenceReferences: readonly Identifier[];
  readonly resultReference: Identifier | null;
  readonly costCents: number;
  readonly sourceRevision: number;
  readonly synchronizedAt: string;
  readonly provenance: CompanyDomainEvent["provenance"];
}

export interface ExternalWorkRecord extends ExternalWorkInput {
  readonly mode: "OBSERVED" | "FEDERATED";
}

const INPUT_KEYS = [
  "id", "companyId", "agentId", "initiatedBy", "title", "summary", "status",
  "source", "evidenceReferences", "resultReference", "costCents",
  "sourceRevision", "synchronizedAt", "provenance",
] as const;
const SOURCE_KEYS = [
  "connectorId", "externalId", "channelReference", "threadReference",
  "workspaceReference", "returnUrl",
] as const;
const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const REFERENCE = /^[\p{L}\p{N}._:/@#-]{1,240}$/u;
const STATUSES = new Set<WorkStatus>([
  "PENDING", "WORKING", "WAITING", "BLOCKED", "AWAITING_APPROVAL",
  "COMPLETED", "FAILED", "CANCELLED",
]);

function exactKeys(
  value: object,
  expected: readonly string[],
  code: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length ||
      actual.some((key, index) => key !== required[index])) {
    throw new Error(code);
  }
}

function id(value: string, code: string): Identifier {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function optionalId(value: string | null, code: string): Identifier | null {
  return value === null ? null : id(value, code);
}

function reference(value: string | null, code: string): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!REFERENCE.test(normalized)) throw new Error(code);
  return normalized;
}

function returnUrl(value: string | null): string | null {
  if (value === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("EXTERNAL_WORK_RETURN_URL_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("EXTERNAL_WORK_RETURN_URL_INVALID");
  }
  return parsed.toString();
}

export function validateExternalWork(
  input: ExternalWorkInput,
  mode: ExternalWorkRecord["mode"],
): ExternalWorkRecord {
  exactKeys(input, INPUT_KEYS, "EXTERNAL_WORK_FIELDS_INVALID");
  if (!input.source || typeof input.source !== "object") {
    throw new Error("EXTERNAL_WORK_SOURCE_INVALID");
  }
  exactKeys(input.source, SOURCE_KEYS, "EXTERNAL_WORK_SOURCE_FIELDS_INVALID");
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title || [...title].length > 120) throw new Error("EXTERNAL_WORK_TITLE_INVALID");
  if (!summary || [...summary].length > 2_000) throw new Error("EXTERNAL_WORK_SUMMARY_INVALID");
  if (!STATUSES.has(input.status)) throw new Error("EXTERNAL_WORK_STATUS_INVALID");
  if (!Number.isSafeInteger(input.costCents) || input.costCents < 0) {
    throw new Error("EXTERNAL_WORK_COST_INVALID");
  }
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new Error("EXTERNAL_WORK_SOURCE_REVISION_INVALID");
  }
  if (!Number.isFinite(Date.parse(input.synchronizedAt))) {
    throw new Error("EXTERNAL_WORK_SYNCHRONIZED_AT_INVALID");
  }
  if (!["PRODUCTION", "DEMO_FIXTURE"].includes(input.provenance)) {
    throw new Error("EXTERNAL_WORK_PROVENANCE_INVALID");
  }
  if (input.status === "COMPLETED" && !input.resultReference) {
    throw new Error("EXTERNAL_WORK_RESULT_REQUIRED");
  }
  if (mode === "OBSERVED" && input.source.workspaceReference !== null) {
    throw new Error("OBSERVED_WORK_WORKSPACE_REFERENCE_INVALID");
  }
  if (mode === "FEDERATED" && input.source.workspaceReference === null) {
    throw new Error("FEDERATED_WORK_WORKSPACE_REFERENCE_REQUIRED");
  }
  const evidenceReferences = input.evidenceReferences.map((item) =>
    id(item, "EXTERNAL_WORK_EVIDENCE_REFERENCES_INVALID")
  );
  if (new Set(evidenceReferences).size !== evidenceReferences.length) {
    throw new Error("EXTERNAL_WORK_EVIDENCE_REFERENCES_INVALID");
  }
  return {
    ...input,
    id: id(input.id, "EXTERNAL_WORK_ID_INVALID"),
    companyId: id(input.companyId, "EXTERNAL_WORK_COMPANY_ID_INVALID"),
    agentId: id(input.agentId, "EXTERNAL_WORK_AGENT_ID_INVALID"),
    initiatedBy: optionalId(input.initiatedBy, "EXTERNAL_WORK_INITIATOR_INVALID"),
    title,
    summary,
    source: {
      connectorId: id(input.source.connectorId, "EXTERNAL_WORK_CONNECTOR_ID_INVALID"),
      externalId: reference(input.source.externalId, "EXTERNAL_WORK_EXTERNAL_ID_INVALID")!,
      channelReference: reference(
        input.source.channelReference,
        "EXTERNAL_WORK_CHANNEL_REFERENCE_INVALID",
      ),
      threadReference: reference(
        input.source.threadReference,
        "EXTERNAL_WORK_THREAD_REFERENCE_INVALID",
      ),
      workspaceReference: reference(
        input.source.workspaceReference,
        "EXTERNAL_WORK_WORKSPACE_REFERENCE_INVALID",
      ),
      returnUrl: returnUrl(input.source.returnUrl),
    },
    evidenceReferences,
    resultReference: optionalId(
      input.resultReference,
      "EXTERNAL_WORK_RESULT_REFERENCE_INVALID",
    ),
    mode,
  };
}

export function externalWorkIdentity(
  record: Pick<ExternalWorkRecord, "companyId" | "source">,
): string {
  return `${record.companyId}\u0000${record.source.connectorId}\u0000${record.source.externalId}`;
}

