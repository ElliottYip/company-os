import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import type { CompanyDomainEvent, Identifier } from "../../../core/control-plane.ts";
import type {
  AppendResult,
  EventReadOptions,
} from "../../../ports/event-data-store-port.ts";
import type {
  DurableCommitCommand,
  DurableCommitResult,
  DurableControlPlaneStorePort,
  OutboxPublication,
  ProjectionCheckpoint,
  SaveProjectionCheckpointCommand,
} from "../../../ports/durable-control-plane-store-port.ts";
import type { createCompanyDatabase } from "./company-database.ts";
import {
  companies,
  connectorOutbox,
  domainEvents,
  projectionCheckpoints,
} from "./company-access-schema.ts";

type CompanyDatabase = ReturnType<typeof createCompanyDatabase>["db"];

export interface DurableBackupState {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly events: readonly CompanyDomainEvent[];
  readonly outbox: readonly OutboxPublication[];
  readonly checkpoints: Readonly<Record<string, ProjectionCheckpoint>>;
}

interface DurableBackup extends DurableBackupState {
  readonly backupVersion: 1;
  readonly digest: string;
}

const PROJECTION_NAME = /^[a-z][a-z0-9.-]{0,63}$/;

function instant(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error("INVALID_TIMESTAMP");
  return value;
}

function digest(state: DurableBackupState): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(state)).digest("hex")}`;
}

export function parseDurableBackupState(source: string, expectedCompanyId?: Identifier): DurableBackupState {
  let value: DurableBackup;
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    value = parsed as DurableBackup;
  } catch {
    throw new Error("DURABLE_BACKUP_INVALID");
  }
  if (value.backupVersion !== 1 || value.schemaVersion !== 1 ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value.companyId) ||
      (expectedCompanyId !== undefined && value.companyId !== expectedCompanyId) ||
      !Array.isArray(value.events) || !Array.isArray(value.outbox) ||
      !value.checkpoints || typeof value.checkpoints !== "object" || Array.isArray(value.checkpoints)) {
    throw new Error("DURABLE_BACKUP_INVALID");
  }
  const state: DurableBackupState = {
    schemaVersion: value.schemaVersion,
    companyId: value.companyId,
    events: value.events,
    outbox: value.outbox,
    checkpoints: value.checkpoints,
  };
  const portableId = (candidate: unknown, maximum: number) => typeof candidate === "string" &&
    new RegExp(`^[a-z0-9][a-z0-9-]{0,${maximum - 1}}$`).test(candidate);
  const eventIds = new Set<string>();
  const invalidEvent = value.events.some((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return true;
    const event = candidate as CompanyDomainEvent;
    if (!portableId(event.id, 128) || eventIds.has(event.id)) return true;
    eventIds.add(event.id);
    return event.companyId !== value.companyId || !portableId(event.actorId, 64) ||
      typeof event.type !== "string" || !event.type.trim() || event.type.length > 160 ||
      !Number.isFinite(Date.parse(event.occurredAt)) ||
      (event.correlationId !== undefined && !portableId(event.correlationId, 128)) ||
      (event.causationId !== undefined && !portableId(event.causationId, 128)) ||
      !["PRODUCTION", "DEMO_FIXTURE"].includes(event.provenance);
  });
  const publicationIds = new Set<string>();
  const invalidPublication = value.outbox.some((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return true;
    const publication = candidate as OutboxPublication;
    if (!portableId(publication.id, 128) || publicationIds.has(publication.id)) return true;
    publicationIds.add(publication.id);
    const deliveredAtValid = publication.status === "PENDING"
      ? publication.deliveredAt === null
      : typeof publication.deliveredAt === "string" && Number.isFinite(Date.parse(publication.deliveredAt));
    return publication.companyId !== value.companyId || !Number.isSafeInteger(publication.sequence) ||
      publication.sequence !== index + 1 || typeof publication.topic !== "string" || !publication.topic.trim() ||
      typeof publication.partitionKey !== "string" || !publication.partitionKey.trim() ||
      !["PENDING", "DELIVERED"].includes(publication.status) ||
      !Number.isFinite(Date.parse(publication.occurredAt)) || !deliveredAtValid;
  });
  const invalidCheckpoint = Object.entries(value.checkpoints).some(([name, candidate]) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return true;
    const checkpoint = candidate as ProjectionCheckpoint;
    return !PROJECTION_NAME.test(name) || checkpoint.companyId !== value.companyId ||
      checkpoint.projectionName !== name || !Number.isSafeInteger(checkpoint.eventSequence) ||
      checkpoint.eventSequence < 0 || checkpoint.eventSequence > value.events.length ||
      typeof checkpoint.updatedAt !== "string" || !Number.isFinite(Date.parse(checkpoint.updatedAt));
  });
  if (invalidEvent || invalidPublication || invalidCheckpoint || value.digest !== digest(state)) {
    throw new Error("DURABLE_BACKUP_INVALID");
  }
  return structuredClone(state);
}

export class PostgresEventStore implements DurableControlPlaneStorePort {
  readonly #database: CompanyDatabase;

  constructor(database: CompanyDatabase) {
    this.#database = database;
  }

  async append(event: CompanyDomainEvent, expectedSequence?: number): Promise<AppendResult> {
    return this.#commit({ event, publications: [], expectedEventSequence: expectedSequence ?? 0 }, expectedSequence);
  }

  async commit(command: DurableCommitCommand): Promise<DurableCommitResult> {
    return this.#commit(command, command.expectedEventSequence);
  }

  async #commit(
    command: DurableCommitCommand,
    expectedSequence: number | undefined,
  ): Promise<DurableCommitResult> {
    return this.#database.transaction(async (transaction) => {
      const event = command.event;
      const company = await transaction.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, event.companyId)).for("update").then((rows) => rows[0] ?? null);
      if (!company) throw new Error("ORGANIZATION_NOT_FOUND");
      const tail = await transaction.select({ sequence: domainEvents.sequence }).from(domainEvents)
        .where(eq(domainEvents.companyId, event.companyId)).orderBy(desc(domainEvents.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      if (expectedSequence !== undefined && expectedSequence !== tail) {
        throw new Error("EVENT_SEQUENCE_CONFLICT");
      }
      for (const publication of command.publications) {
        if (publication.companyId !== event.companyId) throw new Error("CROSS_COMPANY_PUBLICATION_REJECTED");
        if (!publication.topic.trim() || !publication.partitionKey.trim()) {
          throw new Error("PUBLICATION_ROUTE_REQUIRED");
        }
        instant(publication.occurredAt);
      }
      const outboxTail = await transaction.select({ sequence: connectorOutbox.sequence })
        .from(connectorOutbox).where(eq(connectorOutbox.companyId, event.companyId))
        .orderBy(desc(connectorOutbox.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      const stored = await transaction.insert(domainEvents).values({
        id: event.id,
        companyId: event.companyId,
        sequence: tail + 1,
        type: event.type,
        occurredAt: event.occurredAt,
        actorId: event.actorId,
        payload: event.payload,
        correlationId: event.correlationId,
        causationId: event.causationId,
        provenance: event.provenance,
      }).returning({ sequence: domainEvents.sequence, storedAt: domainEvents.storedAt })
        .then((rows) => rows[0]);
      if (!stored) throw new Error("EVENT_APPEND_FAILED");
      const publicationSequences: number[] = [];
      for (const [index, publication] of command.publications.entries()) {
        const sequence = outboxTail + index + 1;
        await transaction.insert(connectorOutbox).values({
          id: publication.id, companyId: publication.companyId, sequence,
          topic: publication.topic, partitionKey: publication.partitionKey,
          payload: publication.payload, occurredAt: publication.occurredAt,
          status: "PENDING", deliveredAt: null,
        });
        publicationSequences.push(sequence);
      }
      return {
        sequence: stored.sequence,
        storedAt: stored.storedAt.toISOString(),
        publicationSequences,
      };
    });
  }

  async read(companyId: string, options: EventReadOptions = {}): Promise<readonly CompanyDomainEvent[]> {
    if (options.types && options.types.length === 0) return [];
    const predicates = [eq(domainEvents.companyId, companyId)];
    if (options.afterSequence !== undefined) predicates.push(gt(domainEvents.sequence, options.afterSequence));
    if (options.types?.length) predicates.push(inArray(domainEvents.type, [...options.types]));
    const rows = await this.#database.select().from(domainEvents)
      .where(and(...predicates)).orderBy(asc(domainEvents.sequence));
    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      type: row.type,
      occurredAt: row.occurredAt,
      actorId: row.actorId,
      payload: structuredClone(row.payload),
      ...(row.correlationId ? { correlationId: row.correlationId } : {}),
      ...(row.causationId ? { causationId: row.causationId } : {}),
      provenance: row.provenance as CompanyDomainEvent["provenance"],
    }));
  }

  async resetFixture(companyId: string): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      const production = await transaction.select({ id: domainEvents.id }).from(domainEvents)
        .where(and(eq(domainEvents.companyId, companyId), ne(domainEvents.provenance, "DEMO_FIXTURE")))
        .limit(1).then((rows) => rows[0] ?? null);
      if (production) throw new Error("PRODUCTION_EVENT_STREAM_RESET_FORBIDDEN");
      await transaction.delete(projectionCheckpoints).where(eq(projectionCheckpoints.companyId, companyId));
      await transaction.delete(connectorOutbox).where(eq(connectorOutbox.companyId, companyId));
      await transaction.delete(domainEvents).where(eq(domainEvents.companyId, companyId));
    });
  }

  async readPendingPublications(
    companyId: Identifier,
    options: { readonly afterSequence: number; readonly limit: number },
  ): Promise<readonly OutboxPublication[]> {
    if (!Number.isSafeInteger(options.afterSequence) || options.afterSequence < 0 ||
        !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 1_000) {
      throw new Error("INVALID_OUTBOX_PAGE");
    }
    const rows = await this.#database.select().from(connectorOutbox).where(and(
      eq(connectorOutbox.companyId, companyId),
      eq(connectorOutbox.status, "PENDING"),
      gt(connectorOutbox.sequence, options.afterSequence),
    )).orderBy(asc(connectorOutbox.sequence)).limit(options.limit);
    return rows.map((row) => ({
      id: row.id, companyId: row.companyId, sequence: row.sequence, topic: row.topic,
      partitionKey: row.partitionKey, payload: structuredClone(row.payload),
      occurredAt: row.occurredAt, status: row.status as OutboxPublication["status"],
      deliveredAt: row.deliveredAt,
    }));
  }

  async markPublicationDelivered(
    companyId: Identifier,
    publicationId: Identifier,
    deliveredAt: string,
  ): Promise<void> {
    instant(deliveredAt);
    await this.#database.transaction(async (transaction) => {
      const publication = await transaction.select().from(connectorOutbox).where(and(
        eq(connectorOutbox.companyId, companyId), eq(connectorOutbox.id, publicationId),
      )).for("update").then((rows) => rows[0] ?? null);
      if (!publication) throw new Error("OUTBOX_PUBLICATION_NOT_FOUND");
      if (publication.status === "DELIVERED") {
        if (publication.deliveredAt !== deliveredAt) throw new Error("OUTBOX_PUBLICATION_ALREADY_DELIVERED");
        return;
      }
      await transaction.update(connectorOutbox).set({ status: "DELIVERED", deliveredAt })
        .where(and(eq(connectorOutbox.companyId, companyId), eq(connectorOutbox.id, publicationId)));
    });
  }

  async loadProjectionCheckpoint(
    companyId: Identifier,
    projectionName: string,
  ): Promise<ProjectionCheckpoint | null> {
    if (!PROJECTION_NAME.test(projectionName)) throw new Error("PROJECTION_NAME_INVALID");
    const row = await this.#database.select().from(projectionCheckpoints).where(and(
      eq(projectionCheckpoints.companyId, companyId),
      eq(projectionCheckpoints.projectionName, projectionName),
    )).then((rows) => rows[0] ?? null);
    return row ? { ...row } : null;
  }

  async saveProjectionCheckpoint(command: SaveProjectionCheckpointCommand): Promise<void> {
    if (!PROJECTION_NAME.test(command.projectionName)) throw new Error("PROJECTION_NAME_INVALID");
    instant(command.updatedAt);
    await this.#database.transaction(async (transaction) => {
      await transaction.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, command.companyId)).for("update");
      const current = await transaction.select().from(projectionCheckpoints).where(and(
        eq(projectionCheckpoints.companyId, command.companyId),
        eq(projectionCheckpoints.projectionName, command.projectionName),
      )).then((rows) => rows[0] ?? null);
      const currentSequence = current?.eventSequence ?? 0;
      if (currentSequence !== command.expectedEventSequence) throw new Error("PROJECTION_CHECKPOINT_CONFLICT");
      if (command.eventSequence < currentSequence) throw new Error("PROJECTION_CHECKPOINT_REWIND");
      const eventTail = await transaction.select({ sequence: domainEvents.sequence }).from(domainEvents)
        .where(eq(domainEvents.companyId, command.companyId)).orderBy(desc(domainEvents.sequence)).limit(1)
        .then((rows) => rows[0]?.sequence ?? 0);
      if (command.eventSequence > eventTail) throw new Error("PROJECTION_CHECKPOINT_BEYOND_STREAM");
      await transaction.insert(projectionCheckpoints).values({
        companyId: command.companyId, projectionName: command.projectionName,
        eventSequence: command.eventSequence, updatedAt: command.updatedAt,
      }).onConflictDoUpdate({
        target: [projectionCheckpoints.companyId, projectionCheckpoints.projectionName],
        set: { eventSequence: command.eventSequence, updatedAt: command.updatedAt },
      });
    });
  }

  async exportBackup(companyId: Identifier): Promise<string> {
    const [events, outbox, checkpointRows] = await Promise.all([
      this.read(companyId),
      this.#database.select().from(connectorOutbox).where(eq(connectorOutbox.companyId, companyId))
        .orderBy(asc(connectorOutbox.sequence)),
      this.#database.select().from(projectionCheckpoints)
        .where(eq(projectionCheckpoints.companyId, companyId)),
    ]);
    const checkpoints = Object.fromEntries(checkpointRows.map((checkpoint) => [
      checkpoint.projectionName, { ...checkpoint },
    ]));
    const state: DurableBackupState = {
      schemaVersion: 1, companyId, events,
      outbox: outbox.map((row) => ({
        id: row.id, companyId: row.companyId, sequence: row.sequence, topic: row.topic,
        partitionKey: row.partitionKey, payload: structuredClone(row.payload),
        occurredAt: row.occurredAt, status: row.status as OutboxPublication["status"],
        deliveredAt: row.deliveredAt,
      })),
      checkpoints,
    };
    const backup: DurableBackup = { backupVersion: 1, ...state, digest: digest(state) };
    return `${JSON.stringify(backup)}\n`;
  }

  async restoreBackup(companyId: Identifier, source: string): Promise<void> {
    const state = parseDurableBackupState(source, companyId);
    await this.#database.transaction(async (transaction) => {
      const company = await transaction.select({ id: companies.id }).from(companies)
        .where(eq(companies.id, companyId)).for("update").then((rows) => rows[0] ?? null);
      if (!company) throw new Error("ORGANIZATION_NOT_FOUND");
      const [event, publication, checkpoint] = await Promise.all([
        transaction.select({ id: domainEvents.id }).from(domainEvents)
          .where(eq(domainEvents.companyId, companyId)).limit(1).then((rows) => rows[0]),
        transaction.select({ id: connectorOutbox.id }).from(connectorOutbox)
          .where(eq(connectorOutbox.companyId, companyId)).limit(1).then((rows) => rows[0]),
        transaction.select({ name: projectionCheckpoints.projectionName }).from(projectionCheckpoints)
          .where(eq(projectionCheckpoints.companyId, companyId)).limit(1).then((rows) => rows[0]),
      ]);
      if (event || publication || checkpoint) throw new Error("DURABLE_CONTROL_PLANE_NOT_EMPTY");
      for (const [index, item] of state.events.entries()) {
        await transaction.insert(domainEvents).values({
          id: item.id, companyId: item.companyId, sequence: index + 1, type: item.type,
          occurredAt: item.occurredAt, actorId: item.actorId, payload: item.payload,
          correlationId: item.correlationId, causationId: item.causationId,
          provenance: item.provenance,
        });
      }
      for (const item of state.outbox) await transaction.insert(connectorOutbox).values({ ...item });
      for (const item of Object.values(state.checkpoints)) {
        await transaction.insert(projectionCheckpoints).values({ ...item });
      }
    });
  }
}
