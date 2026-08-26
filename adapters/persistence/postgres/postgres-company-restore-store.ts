import { and, eq } from "drizzle-orm";
import { validateCompanyStructure, type CompanyStructure } from "../../../core/company-structure.ts";
import type { CompanyPermissionKey } from "../../../core/company-access.ts";
import type { CompanyRestoreStorePort } from "../../../ports/company-restore-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import {
  companies,
  companyMemberships,
  connectorOutbox,
  domainEvents,
  instanceUserRoles,
  principalPermissionGrants,
  projectionCheckpoints,
} from "./company-access-schema.ts";
import { parseDurableBackupState } from "./postgres-event-store.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];
const TERMINAL_ATTEMPTS = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);

function restoredStructure(events: ReturnType<typeof parseDurableBackupState>["events"]): CompanyStructure {
  const latest = events.filter(({ type }) =>
    type === "organization.registered" || type === "organization.revised").at(-1);
  const structure = latest && (latest.payload as { readonly structure?: unknown }).structure;
  if (!structure) throw new Error("RESTORE_ORGANIZATION_REQUIRED");
  return validateCompanyStructure(structure as CompanyStructure);
}

function assertClosedWork(events: ReturnType<typeof parseDurableBackupState>["events"]): void {
  const latestAttempts = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "work-attempt.recorded") continue;
    const attempt = (event.payload as { readonly attempt?: { readonly id?: unknown; readonly status?: unknown } }).attempt;
    if (typeof attempt?.id === "string" && typeof attempt.status === "string") {
      latestAttempts.set(attempt.id, attempt.status);
    }
  }
  if ([...latestAttempts.values()].some((status) => !TERMINAL_ATTEMPTS.has(status))) {
    throw new Error("RESTORE_UNRESOLVED_WORK");
  }
}

function assertNoPendingApproval(events: ReturnType<typeof parseDurableBackupState>["events"]): void {
  const decided = new Set(events.flatMap(({ type, payload }) => type === "approval.publication.decided"
    ? [String((payload as { decision?: { requestId?: unknown } }).decision?.requestId ?? "")] : []));
  const pending = events.some(({ type, payload }) => type === "approval.publication.requested" && (() => {
    const id = (payload as { request?: { id?: unknown } }).request?.id;
    return typeof id === "string" && !decided.has(id);
  })());
  if (pending) throw new Error("RESTORE_PENDING_APPROVAL");
}

function restoreCandidate(source: string, actorUserId: string) {
  const state = parseDurableBackupState(source);
  if (!state.events.length || state.events.some(({ provenance }) => provenance !== "PRODUCTION")) {
    throw new Error("RESTORE_FORMAL_BACKUP_REQUIRED");
  }
  if (state.outbox.some(({ status }) => status === "PENDING")) throw new Error("RESTORE_PENDING_OUTBOX");
  assertNoPendingApproval(state.events);
  assertClosedWork(state.events);
  const structure = restoredStructure(state.events);
  const profile = structure.organization.company;
  if (profile.id !== state.companyId) throw new Error("RESTORE_COMPANY_BINDING_INVALID");
  if (!structure.organization.humans.some(({ id }) => id === actorUserId)) {
    throw new Error("RESTORE_IDENTITY_REBIND_REQUIRED");
  }
  return { state, structure, profile };
}

export class PostgresCompanyRestoreStore implements CompanyRestoreStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async inspectOwnedCompanyRestore(input: { readonly source: string; readonly actorUserId: string }) {
    const candidate = restoreCandidate(input.source, input.actorUserId);
    const [admin, existing] = await Promise.all([
      this.#database.select({ id: instanceUserRoles.id }).from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, input.actorUserId), eq(instanceUserRoles.role, "instance_admin")))
        .then((rows) => rows[0] ?? null),
      this.#database.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, candidate.state.companyId)).then((rows) => rows[0] ?? null),
    ]);
    if (!admin) throw new Error("INSTANCE_ADMIN_REQUIRED");
    if (existing) throw new Error("RESTORE_COMPANY_ALREADY_EXISTS");
    return {
      companyId: candidate.state.companyId,
      name: candidate.profile.name,
      purpose: candidate.profile.purpose,
      locale: candidate.profile.locale,
      actorUserId: input.actorUserId,
      identityBinding: "EXACT" as const,
      eventCount: candidate.state.events.length,
      deliveredPublicationCount: candidate.state.outbox.length,
      checkpointCount: Object.keys(candidate.state.checkpoints).length,
      humanCount: candidate.structure.organization.humans.length,
      agentCount: candidate.structure.organization.agents.length,
    };
  }

  async restoreOwnedCompany(input: {
    readonly source: string;
    readonly actorUserId: string;
    readonly membershipId: string;
    readonly permissionGrants: readonly { readonly id: string; readonly permissionKey: CompanyPermissionKey }[];
  }) {
    const { state, profile } = restoreCandidate(input.source, input.actorUserId);
    if (new Set(input.permissionGrants.map(({ id }) => id)).size !== input.permissionGrants.length ||
        new Set(input.permissionGrants.map(({ permissionKey }) => permissionKey)).size !== input.permissionGrants.length) {
      throw new Error("RESTORE_PERMISSION_GRANTS_INVALID");
    }

    return this.#database.transaction(async (transaction) => {
      const admin = await transaction.select({ id: instanceUserRoles.id }).from(instanceUserRoles)
        .where(and(eq(instanceUserRoles.userId, input.actorUserId), eq(instanceUserRoles.role, "instance_admin")))
        .then((rows) => rows[0] ?? null);
      if (!admin) throw new Error("INSTANCE_ADMIN_REQUIRED");
      const existing = await transaction.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, state.companyId)).for("update").then((rows) => rows[0] ?? null);
      if (existing) throw new Error("RESTORE_COMPANY_ALREADY_EXISTS");

      await transaction.insert(companies).values({
        id: state.companyId, name: profile.name, purpose: profile.purpose, locale: profile.locale,
        defaultResponsibleUserId: input.actorUserId, status: "active",
      });
      await transaction.insert(companyMemberships).values({
        id: input.membershipId, companyId: state.companyId, principalType: "user",
        principalId: input.actorUserId, status: "active", membershipRole: "owner",
      });
      if (input.permissionGrants.length) {
        await transaction.insert(principalPermissionGrants).values(input.permissionGrants.map((grant) => ({
          id: grant.id, companyId: state.companyId, principalType: "user", principalId: input.actorUserId,
          permissionKey: grant.permissionKey, scope: null, grantedByUserId: input.actorUserId,
        })));
      }
      for (const [index, event] of state.events.entries()) {
        await transaction.insert(domainEvents).values({
          id: event.id, companyId: event.companyId, sequence: index + 1, type: event.type,
          occurredAt: event.occurredAt, actorId: event.actorId, payload: event.payload,
          correlationId: event.correlationId, causationId: event.causationId, provenance: event.provenance,
        });
      }
      for (const publication of state.outbox) await transaction.insert(connectorOutbox).values({ ...publication });
      for (const checkpoint of Object.values(state.checkpoints)) {
        await transaction.insert(projectionCheckpoints).values({ ...checkpoint });
      }
      return {
        companyId: state.companyId, membershipId: input.membershipId,
        permissionGrantIds: input.permissionGrants.map(({ id }) => id), ownerUserId: input.actorUserId,
        name: profile.name, purpose: profile.purpose, locale: profile.locale,
      };
    });
  }
}
