import type { CompanyDomainEvent, Identifier } from "../core/control-plane.ts";
import type { ResponsibilityProjection } from "../ports/audit-evidence-port.ts";
import type { ContentDigestPort } from "../ports/content-digest-port.ts";
import type { EventDataStorePort } from "../ports/event-data-store-port.ts";
import type { IdentityPort } from "../ports/identity-port.ts";
import { projectAccountabilityLedger, type AccountabilityLedgerProjection } from "./get-accountability-ledger.ts";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PURPOSES = new Set(["AUDIT_REVIEW", "INCIDENT_REVIEW", "CUSTOMER_PORTABILITY"]);
const MAXIMUM_RECORDS = 20_000;
const MAXIMUM_BYTES = 16 * 1_024 * 1_024;

export type AccountabilityExportPurpose = "AUDIT_REVIEW" | "INCIDENT_REVIEW" | "CUSTOMER_PORTABILITY";

export interface AccountabilityExportPackage {
  readonly schemaVersion: 1;
  readonly packageType: "COMPANY_OS_ACCOUNTABILITY_EXPORT";
  readonly exportId: Identifier;
  readonly companyId: Identifier;
  readonly sourceEventSequence: number;
  readonly exportedAt: string;
  readonly policy: {
    readonly retentionPolicyId: Identifier;
    readonly exportPolicyId: Identifier;
    readonly purposeCode: AccountabilityExportPurpose;
  };
  readonly approvals: AccountabilityLedgerProjection["approvals"];
  readonly evidence: AccountabilityLedgerProjection["evidence"];
  readonly responsibilities: readonly ResponsibilityProjection[];
  readonly digest: string;
}

interface ExportAuditPayload {
  readonly requestId: Identifier;
  readonly exportId: Identifier;
  readonly packageDigest: string;
  readonly sourceEventSequence: number;
  readonly exportedAt: string;
  readonly retentionPolicyId: Identifier;
  readonly exportPolicyId: Identifier;
  readonly purposeCode: AccountabilityExportPurpose;
  readonly approvalCount: number;
  readonly evidenceCount: number;
  readonly responsibilityCount: number;
  readonly authorizationReceiptId: Identifier;
}

export class ExportAccountabilityPackage {
  readonly #identity: IdentityPort;
  readonly #events: EventDataStorePort;
  readonly #now: () => string;
  readonly #nextId: () => Identifier;
  readonly #retentionPolicyId: Identifier;
  readonly #exportPolicyId: Identifier;
  readonly #digests: ContentDigestPort;

  constructor(dependencies: { readonly identity: IdentityPort; readonly events: EventDataStorePort;
    readonly now: () => string; readonly nextId: () => Identifier; readonly retentionPolicyId: Identifier;
    readonly exportPolicyId: Identifier; readonly digests: ContentDigestPort }) {
    if (!ID.test(dependencies.retentionPolicyId) || !ID.test(dependencies.exportPolicyId)) {
      throw new Error("ACCOUNTABILITY_EXPORT_POLICY_INVALID");
    }
    this.#identity = dependencies.identity; this.#events = dependencies.events;
    this.#now = dependencies.now; this.#nextId = dependencies.nextId;
    this.#retentionPolicyId = dependencies.retentionPolicyId;
    this.#exportPolicyId = dependencies.exportPolicyId;
    this.#digests = dependencies.digests;
  }

  async execute(input: { readonly companyId: Identifier; readonly requestId: Identifier;
    readonly purposeCode: AccountabilityExportPurpose }): Promise<{ readonly schemaVersion: 1;
      readonly package: AccountabilityExportPackage }> {
    if (!ID.test(input.companyId) || !ID.test(input.requestId) || !PURPOSES.has(input.purposeCode)) {
      throw new Error("ACCOUNTABILITY_EXPORT_COMMAND_INVALID");
    }
    const identity = await this.#identity.getCurrentIdentity();
    if (!identity || identity.assurance === "LOCAL_DEMO") throw new Error("FORMAL_IDENTITY_REQUIRED");
    if (identity.organizationId !== input.companyId) throw new Error("TENANT_MISMATCH");
    const receipt = await this.#identity.authorize({ companyId: input.companyId, action: "accountability:export",
      resourceId: input.companyId, reason: `Export governed accountability package: ${input.purposeCode}` });
    if (receipt.principalId !== identity.actorId) throw new Error("AUTHORIZATION_PRINCIPAL_MISMATCH");
    const allEvents = await this.#events.read(input.companyId);
    const priorIndex = allEvents.findIndex(({ type, payload }) => type === "accountability.export.completed" &&
      (payload as Partial<ExportAuditPayload>).requestId === input.requestId);
    if (priorIndex >= 0) {
      const prior = validateAudit(allEvents[priorIndex]?.payload, input, this.#retentionPolicyId, this.#exportPolicyId);
      const value = await buildPackage(allEvents.slice(0, priorIndex), input.companyId, prior.exportId,
        prior.exportedAt, prior.retentionPolicyId, prior.exportPolicyId, prior.purposeCode, this.#digests);
      if (value.digest !== prior.packageDigest || prior.sourceEventSequence !== priorIndex ||
          prior.approvalCount !== value.approvals.length || prior.evidenceCount !== value.evidence.length ||
          prior.responsibilityCount !== value.responsibilities.length) {
        throw new Error("ACCOUNTABILITY_EXPORT_REPLAY_INVALID");
      }
      return { schemaVersion: 1, package: value };
    }
    const exportedAt = this.#now();
    if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("ACCOUNTABILITY_EXPORT_TIMESTAMP_INVALID");
    const exportId = this.#nextId();
    if (!ID.test(exportId)) throw new Error("ACCOUNTABILITY_EXPORT_ID_INVALID");
    const value = await buildPackage(allEvents, input.companyId, exportId, exportedAt,
      this.#retentionPolicyId, this.#exportPolicyId, input.purposeCode, this.#digests);
    const payload: ExportAuditPayload = { requestId: input.requestId, exportId, packageDigest: value.digest,
      sourceEventSequence: allEvents.length, exportedAt, retentionPolicyId: this.#retentionPolicyId,
      exportPolicyId: this.#exportPolicyId, purposeCode: input.purposeCode,
      approvalCount: value.approvals.length, evidenceCount: value.evidence.length,
      responsibilityCount: value.responsibilities.length, authorizationReceiptId: receipt.id };
    const event: CompanyDomainEvent = { id: this.#nextId(), companyId: input.companyId,
      type: "accountability.export.completed", occurredAt: exportedAt, actorId: identity.actorId,
      payload, provenance: "PRODUCTION" };
    if (!ID.test(event.id)) throw new Error("ACCOUNTABILITY_EXPORT_EVENT_ID_INVALID");
    await this.#events.append(event, allEvents.length);
    return { schemaVersion: 1, package: value };
  }
}

async function buildPackage(events: readonly CompanyDomainEvent[], companyId: Identifier, exportId: Identifier,
  exportedAt: string, retentionPolicyId: Identifier, exportPolicyId: Identifier,
  purposeCode: AccountabilityExportPurpose, digests: ContentDigestPort): Promise<AccountabilityExportPackage> {
  const ledger = projectAccountabilityLedger(events, companyId, exportedAt, exportedAt);
  const responsibilities = projectResponsibilities(events, ledger);
  const unsigned = { schemaVersion: 1 as const, packageType: "COMPANY_OS_ACCOUNTABILITY_EXPORT" as const,
    exportId, companyId, sourceEventSequence: events.length, exportedAt,
    policy: { retentionPolicyId, exportPolicyId, purposeCode }, approvals: ledger.approvals,
    evidence: ledger.evidence, responsibilities };
  const encoded = JSON.stringify(unsigned);
  if (ledger.approvals.length + ledger.evidence.length + responsibilities.length > MAXIMUM_RECORDS ||
      Buffer.byteLength(encoded, "utf8") > MAXIMUM_BYTES) throw new Error("ACCOUNTABILITY_EXPORT_TOO_LARGE");
  const digest = await digests.sha256Utf8(encoded);
  if (!DIGEST.test(digest)) throw new Error("ACCOUNTABILITY_EXPORT_DIGEST_INVALID");
  return { ...unsigned, digest };
}

function projectResponsibilities(events: readonly CompanyDomainEvent[], ledger: AccountabilityLedgerProjection): ResponsibilityProjection[] {
  type Context = { workId: Identifier; goalInitiatorId: Identifier; accountableHumanId: Identifier;
    executingAgentId: Identifier; permissionIds: readonly Identifier[]; dataAuthorizationIds: readonly Identifier[] };
  const contexts = new Map<Identifier, Context>();
  const formalWork = new Map<Identifier, Omit<Context, "permissionIds" | "dataAuthorizationIds">>();
  const formalAuthority = new Map<Identifier, Pick<Context, "permissionIds" | "dataAuthorizationIds">>();
  for (const event of events) {
    const payload = event.payload as { responsibility?: unknown; work?: unknown; attempt?: unknown };
    if (payload.responsibility !== undefined) {
      const context = responsibilityContext(payload.responsibility);
      contexts.set(context.workId, context);
    }
    const work = formalWorkContext(payload.work);
    if (work) formalWork.set(work.workId, work);
    const authority = formalAuthorityContext(payload.attempt);
    if (authority) formalAuthority.set(authority.workId, authority);
  }
  for (const [workId, work] of formalWork) {
    const authority = formalAuthority.get(workId);
    if (authority) contexts.set(workId, { ...work, ...authority });
  }
  const workIds = new Set<Identifier>([...ledger.approvals.map(({ request }) => request.binding.workId),
    ...ledger.evidence.map(({ workId }) => workId)]);
  return [...workIds].sort().map((workId) => {
    const context = contexts.get(workId);
    if (!context) throw new Error("ACCOUNTABILITY_EXPORT_RESPONSIBILITY_MISSING");
    const evidence = ledger.evidence.filter((item) => item.workId === workId);
    const approvals = ledger.approvals.filter(({ request }) => request.binding.workId === workId);
    return { workId, goalInitiatorId: context.goalInitiatorId,
      accountableHumanId: context.accountableHumanId, executingAgentId: context.executingAgentId,
      permissionReferences: [...context.permissionIds], dataAuthorizationReferences: [...context.dataAuthorizationIds],
      approvalReferences: approvals.map(({ request }) => request.id), evidenceReferences: evidence.map(({ id }) => id),
      resultReference: evidence.findLast(({ kind }) => kind === "RESULT")?.id ?? null };
  });
}

function responsibilityContext(value: unknown): { workId: Identifier; goalInitiatorId: Identifier;
  accountableHumanId: Identifier; executingAgentId: Identifier; permissionIds: readonly Identifier[];
  dataAuthorizationIds: readonly Identifier[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ACCOUNTABILITY_EXPORT_RESPONSIBILITY_INVALID");
  }
  const context = value as { workId?: unknown; goalInitiatorId?: unknown; accountableHumanId?: unknown;
    executingAgentId?: unknown; permissionIds?: unknown; dataAuthorizationIds?: unknown };
  if (![context.workId, context.goalInitiatorId, context.accountableHumanId, context.executingAgentId]
    .every(validIdentifier) || !validIdentifierList(context.permissionIds) ||
    !validIdentifierList(context.dataAuthorizationIds)) {
    throw new Error("ACCOUNTABILITY_EXPORT_RESPONSIBILITY_INVALID");
  }
  return { workId: context.workId as Identifier, goalInitiatorId: context.goalInitiatorId as Identifier,
    accountableHumanId: context.accountableHumanId as Identifier,
    executingAgentId: context.executingAgentId as Identifier,
    permissionIds: [...context.permissionIds] as Identifier[],
    dataAuthorizationIds: [...context.dataAuthorizationIds] as Identifier[] };
}

function formalWorkContext(value: unknown): { workId: Identifier; goalInitiatorId: Identifier;
  accountableHumanId: Identifier; executingAgentId: Identifier } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const work = value as { id?: unknown; requestedBy?: unknown; accountableHumanId?: unknown; agentId?: unknown };
  if (![work.id, work.requestedBy, work.accountableHumanId, work.agentId].every(validIdentifier)) return null;
  return { workId: work.id as Identifier, goalInitiatorId: work.requestedBy as Identifier,
    accountableHumanId: work.accountableHumanId as Identifier, executingAgentId: work.agentId as Identifier };
}

function formalAuthorityContext(value: unknown): { workId: Identifier; permissionIds: readonly Identifier[];
  dataAuthorizationIds: readonly Identifier[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const attempt = value as { workId?: unknown; authority?: unknown };
  if (!validIdentifier(attempt.workId) || !attempt.authority || typeof attempt.authority !== "object" ||
      Array.isArray(attempt.authority)) return null;
  const authority = attempt.authority as { permissionIds?: unknown; dataAuthorizationIds?: unknown };
  if (!validIdentifierList(authority.permissionIds) || !validIdentifierList(authority.dataAuthorizationIds)) {
    throw new Error("ACCOUNTABILITY_EXPORT_RESPONSIBILITY_INVALID");
  }
  return { workId: attempt.workId as Identifier, permissionIds: [...authority.permissionIds] as Identifier[],
    dataAuthorizationIds: [...authority.dataAuthorizationIds] as Identifier[] };
}

function validIdentifier(value: unknown): value is Identifier {
  return typeof value === "string" && ID.test(value);
}

function validIdentifierList(value: unknown): value is readonly Identifier[] {
  return Array.isArray(value) && value.every(validIdentifier);
}

function validateAudit(value: unknown, input: { requestId: Identifier; purposeCode: AccountabilityExportPurpose },
  retentionPolicyId: Identifier, exportPolicyId: Identifier): ExportAuditPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("ACCOUNTABILITY_EXPORT_REPLAY_INVALID");
  const record = value as Partial<ExportAuditPayload>;
  if (record.requestId !== input.requestId || record.purposeCode !== input.purposeCode ||
      record.retentionPolicyId !== retentionPolicyId || record.exportPolicyId !== exportPolicyId ||
      !record.exportId || !ID.test(record.exportId) || !record.packageDigest || !DIGEST.test(record.packageDigest) ||
      !Number.isSafeInteger(record.sourceEventSequence) || !Number.isFinite(Date.parse(String(record.exportedAt))) ||
      !Number.isSafeInteger(record.approvalCount) || !Number.isSafeInteger(record.evidenceCount) ||
      !Number.isSafeInteger(record.responsibilityCount) || !record.authorizationReceiptId ||
      !ID.test(record.authorizationReceiptId)) throw new Error("ACCOUNTABILITY_EXPORT_REPLAY_INVALID");
  return record as ExportAuditPayload;
}
