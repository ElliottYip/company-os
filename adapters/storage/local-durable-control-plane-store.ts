import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CompanyDomainEvent, Identifier } from "../../core/control-plane.ts";
import type {
  DurableCommitCommand,
  DurableCommitResult,
  DurableControlPlaneStorePort,
  OutboxPublication,
  ProjectionCheckpoint,
  SaveProjectionCheckpointCommand,
} from "../../ports/durable-control-plane-store-port.ts";
import type { AppendResult, EventReadOptions } from "../../ports/event-data-store-port.ts";

interface PersistedControlPlaneState {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly events: readonly CompanyDomainEvent[];
  readonly outbox: readonly OutboxPublication[];
  readonly checkpoints: Readonly<Record<string, ProjectionCheckpoint>>;
}

interface LegacyEventStream {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly events: readonly CompanyDomainEvent[];
}

interface ControlPlaneBackup extends PersistedControlPlaneState {
  readonly backupVersion: 1;
  readonly digest: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PROJECTION_NAME = /^[a-z][a-z0-9.-]{0,63}$/;

function assertCompanyId(companyId: Identifier): void {
  if (!PORTABLE_ID.test(companyId)) throw new Error("Invalid company ID.");
}

function assertProjectionName(name: string): void {
  if (!PROJECTION_NAME.test(name)) throw new Error("Invalid projection name.");
}

function assertInstant(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error("Invalid timestamp.");
}

function isDomainEvent(value: unknown, companyId: Identifier): value is CompanyDomainEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    candidate.companyId === companyId &&
    typeof candidate.type === "string" &&
    typeof candidate.occurredAt === "string" &&
    typeof candidate.actorId === "string" &&
    ["PRODUCTION", "DEMO_FIXTURE"].includes(String(candidate.provenance)) &&
    Object.hasOwn(candidate, "payload");
}

function isPublication(value: unknown, companyId: Identifier): value is OutboxPublication {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" &&
    candidate.companyId === companyId &&
    typeof candidate.topic === "string" &&
    typeof candidate.partitionKey === "string" &&
    Number.isSafeInteger(candidate.sequence) &&
    ["PENDING", "DELIVERED"].includes(String(candidate.status)) &&
    (candidate.deliveredAt === null || typeof candidate.deliveredAt === "string") &&
    Object.hasOwn(candidate, "payload");
}

function isCheckpoint(value: unknown, companyId: Identifier, name: string): value is ProjectionCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.companyId === companyId &&
    candidate.projectionName === name &&
    Number.isSafeInteger(candidate.eventSequence) &&
    typeof candidate.updatedAt === "string";
}

export class LocalDurableControlPlaneStore implements DurableControlPlaneStorePort {
  readonly #directory: string;
  readonly #tails = new Map<Identifier, Promise<void>>();

  constructor(directory: string) {
    if (!directory.trim()) throw new Error("Control-plane store directory is required.");
    this.#directory = directory;
  }

  async append(event: CompanyDomainEvent, expectedSequence?: number): Promise<AppendResult> {
    const current = expectedSequence ?? (await this.read(event.companyId)).length;
    return this.commit({ event, publications: [], expectedEventSequence: current });
  }

  async commit(command: DurableCommitCommand): Promise<DurableCommitResult> {
    return this.#exclusive(command.event.companyId, async () => {
      const companyId = command.event.companyId;
      const state = await this.#load(companyId);
      if (state.events.length !== command.expectedEventSequence) {
        throw new Error(
          `Sequence conflict: expected ${command.expectedEventSequence}, found ${state.events.length}.`,
        );
      }
      if (state.events.some(({ id }) => id === command.event.id)) {
        throw new Error(`Duplicate event ID: ${command.event.id}.`);
      }
      const existingPublicationIds = new Set(state.outbox.map(({ id }) => id));
      const commandPublicationIds = new Set<Identifier>();
      for (const publication of command.publications) {
        if (publication.companyId !== companyId) throw new Error("Cross-company publication rejected.");
        if (existingPublicationIds.has(publication.id) || commandPublicationIds.has(publication.id)) {
          throw new Error(`Duplicate publication ID: ${publication.id}.`);
        }
        commandPublicationIds.add(publication.id);
        if (!publication.topic.trim() || !publication.partitionKey.trim()) {
          throw new Error("Publication topic and partition key are required.");
        }
        assertInstant(publication.occurredAt);
      }
      const publicationSequences = command.publications.map((_, index) => state.outbox.length + index + 1);
      const outbox = command.publications.map((publication, index): OutboxPublication => ({
        ...structuredClone(publication),
        sequence: publicationSequences[index] as number,
        status: "PENDING",
        deliveredAt: null,
      }));
      const next: PersistedControlPlaneState = {
        ...state,
        events: [...state.events, structuredClone(command.event)],
        outbox: [...state.outbox, ...outbox],
      };
      await this.#persist(next);
      return {
        sequence: next.events.length,
        storedAt: new Date().toISOString(),
        publicationSequences,
      };
    });
  }

  async read(
    companyId: Identifier,
    options: EventReadOptions = {},
  ): Promise<readonly CompanyDomainEvent[]> {
    const state = await this.#load(companyId);
    return structuredClone(state.events
      .slice(options.afterSequence ?? 0)
      .filter((event) => !options.types || options.types.includes(event.type)));
  }

  async readPendingPublications(
    companyId: Identifier,
    options: { readonly afterSequence: number; readonly limit: number },
  ): Promise<readonly OutboxPublication[]> {
    if (!Number.isSafeInteger(options.afterSequence) || options.afterSequence < 0 ||
        !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 1_000) {
      throw new Error("Invalid outbox page.");
    }
    const state = await this.#load(companyId);
    return structuredClone(state.outbox.filter(({ sequence, status }) =>
      sequence > options.afterSequence && status === "PENDING"
    ).slice(0, options.limit));
  }

  async markPublicationDelivered(
    companyId: Identifier,
    publicationId: Identifier,
    deliveredAt: string,
  ): Promise<void> {
    assertInstant(deliveredAt);
    await this.#exclusive(companyId, async () => {
      const state = await this.#load(companyId);
      const publication = state.outbox.find(({ id }) => id === publicationId);
      if (!publication) throw new Error("Publication not found.");
      if (publication.status === "DELIVERED") {
        if (publication.deliveredAt !== deliveredAt) throw new Error("Publication already delivered.");
        return;
      }
      await this.#persist({
        ...state,
        outbox: state.outbox.map((item): OutboxPublication => item.id === publicationId
          ? { ...item, status: "DELIVERED", deliveredAt }
          : item),
      });
    });
  }

  async loadProjectionCheckpoint(
    companyId: Identifier,
    projectionName: string,
  ): Promise<ProjectionCheckpoint | null> {
    assertProjectionName(projectionName);
    const checkpoint = (await this.#load(companyId)).checkpoints[projectionName];
    return checkpoint ? structuredClone(checkpoint) : null;
  }

  async saveProjectionCheckpoint(command: SaveProjectionCheckpointCommand): Promise<void> {
    assertProjectionName(command.projectionName);
    assertInstant(command.updatedAt);
    await this.#exclusive(command.companyId, async () => {
      const state = await this.#load(command.companyId);
      const current = state.checkpoints[command.projectionName];
      const currentSequence = current?.eventSequence ?? 0;
      if (currentSequence !== command.expectedEventSequence) {
        throw new Error(
          `Checkpoint conflict: expected ${command.expectedEventSequence}, found ${currentSequence}.`,
        );
      }
      if (command.eventSequence < currentSequence) throw new Error("Checkpoint rewind rejected.");
      if (command.eventSequence > state.events.length) {
        throw new Error("Checkpoint beyond event stream rejected.");
      }
      const checkpoint: ProjectionCheckpoint = {
        companyId: command.companyId,
        projectionName: command.projectionName,
        eventSequence: command.eventSequence,
        updatedAt: command.updatedAt,
      };
      await this.#persist({
        ...state,
        checkpoints: { ...state.checkpoints, [command.projectionName]: checkpoint },
      });
    });
  }

  async exportBackup(companyId: Identifier): Promise<string> {
    const state = await this.#load(companyId);
    const backup: ControlPlaneBackup = {
      backupVersion: 1,
      ...state,
      digest: this.#digest(state),
    };
    return `${JSON.stringify(backup)}\n`;
  }

  async restoreBackup(companyId: Identifier, source: string): Promise<void> {
    await this.#exclusive(companyId, async () => {
      const current = await this.#load(companyId);
      if (current.events.length || current.outbox.length || Object.keys(current.checkpoints).length) {
        throw new Error("Durable control-plane store is not empty.");
      }
      let candidate: ControlPlaneBackup;
      try {
        const parsed: unknown = JSON.parse(source);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        candidate = parsed as ControlPlaneBackup;
      } catch {
        throw new Error("Invalid durable control-plane backup.");
      }
      const checkpoints = candidate.checkpoints;
      const state: PersistedControlPlaneState = {
        schemaVersion: candidate.schemaVersion,
        companyId: candidate.companyId,
        events: candidate.events,
        outbox: candidate.outbox,
        checkpoints,
      };
      if (candidate.backupVersion !== 1 || candidate.schemaVersion !== 1 ||
          candidate.companyId !== companyId || !Array.isArray(candidate.events) ||
          !candidate.events.every((item) => isDomainEvent(item, companyId)) ||
          !Array.isArray(candidate.outbox) ||
          !candidate.outbox.every((item) => isPublication(item, companyId)) ||
          !checkpoints || typeof checkpoints !== "object" || Array.isArray(checkpoints) ||
          !Object.entries(checkpoints).every(([name, item]) =>
            PROJECTION_NAME.test(name) && isCheckpoint(item, companyId, name)
          ) || candidate.digest !== this.#digest(state)) {
        throw new Error("Durable control-plane backup digest or schema is invalid.");
      }
      await this.#persist(structuredClone(state));
    });
  }

  async resetFixture(companyId: Identifier): Promise<void> {
    await this.#exclusive(companyId, async () => {
      const state = await this.#load(companyId);
      if (state.events.some(({ provenance }) => provenance !== "DEMO_FIXTURE")) {
        throw new Error("Production control-plane state cannot be reset.");
      }
      try {
        await unlink(this.#path(companyId));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    });
  }

  async #load(companyId: Identifier): Promise<PersistedControlPlaneState> {
    assertCompanyId(companyId);
    let source: string;
    try {
      source = await readFile(this.#path(companyId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return await this.#loadLegacyOrEmpty(companyId);
      }
      throw error;
    }
    try {
      const parsed: unknown = JSON.parse(source);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const candidate = parsed as Record<string, unknown>;
      const checkpoints = candidate.checkpoints;
      if (candidate.schemaVersion !== 1 || candidate.companyId !== companyId ||
          !Array.isArray(candidate.events) ||
          !candidate.events.every((item) => isDomainEvent(item, companyId)) ||
          !Array.isArray(candidate.outbox) ||
          !candidate.outbox.every((item) => isPublication(item, companyId)) ||
          !checkpoints || typeof checkpoints !== "object" || Array.isArray(checkpoints) ||
          !Object.entries(checkpoints).every(([name, item]) =>
            PROJECTION_NAME.test(name) && isCheckpoint(item, companyId, name)
          )) {
        throw new Error();
      }
      return parsed as PersistedControlPlaneState;
    } catch {
      throw new Error(`Corrupt durable control-plane store for ${companyId}.`);
    }
  }

  async #loadLegacyOrEmpty(companyId: Identifier): Promise<PersistedControlPlaneState> {
    let source: string;
    try {
      source = await readFile(join(this.#directory, `${companyId}.events.json`), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: 1, companyId, events: [], outbox: [], checkpoints: {} };
      }
      throw error;
    }
    try {
      const parsed: unknown = JSON.parse(source);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const candidate = parsed as Record<string, unknown>;
      if (candidate.schemaVersion !== 1 || candidate.companyId !== companyId ||
          !Array.isArray(candidate.events) ||
          !candidate.events.every((item) => isDomainEvent(item, companyId))) {
        throw new Error();
      }
      const legacy = parsed as LegacyEventStream;
      return {
        schemaVersion: 1,
        companyId,
        events: structuredClone(legacy.events),
        outbox: [],
        checkpoints: {},
      };
    } catch {
      throw new Error(`Corrupt legacy event store for ${companyId}.`);
    }
  }

  async #persist(state: PersistedControlPlaneState): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const target = this.#path(state.companyId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }

  #path(companyId: Identifier): string {
    assertCompanyId(companyId);
    return join(this.#directory, `${companyId}.control-plane.json`);
  }

  #digest(state: PersistedControlPlaneState): string {
    return `sha256:${createHash("sha256").update(JSON.stringify(state)).digest("hex")}`;
  }

  async #exclusive<T>(companyId: Identifier, operation: () => Promise<T>): Promise<T> {
    const prior = this.#tails.get(companyId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = prior.then(() => current);
    this.#tails.set(companyId, tail);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.#tails.get(companyId) === tail) this.#tails.delete(companyId);
    }
  }
}
