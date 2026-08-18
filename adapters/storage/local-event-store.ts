import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

import type {
  CompanyDomainEvent,
  Identifier,
} from "../../core/control-plane.ts";
import type {
  AppendResult,
  EventDataStorePort,
  EventReadOptions,
} from "../../ports/event-data-store-port.ts";

interface PersistedEventStream {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly events: readonly CompanyDomainEvent[];
}

interface EventStoreBackup extends PersistedEventStream {
  readonly backupVersion: 1;
  readonly digest: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function assertCompanyId(companyId: Identifier): void {
  if (!PORTABLE_ID.test(companyId)) throw new Error("Invalid company ID.");
}

function isDomainEvent(value: unknown, companyId: Identifier): value is CompanyDomainEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.companyId === companyId &&
    typeof candidate.type === "string" &&
    typeof candidate.occurredAt === "string" &&
    typeof candidate.actorId === "string" &&
    ["PRODUCTION", "DEMO_FIXTURE"].includes(String(candidate.provenance)) &&
    Object.hasOwn(candidate, "payload")
  );
}

export class LocalEventStore implements EventDataStorePort {
  readonly #directory: string;
  readonly #tails = new Map<Identifier, Promise<void>>();

  constructor(directory: string) {
    if (!directory.trim()) throw new Error("Event store directory is required.");
    this.#directory = directory;
  }

  async append(
    event: CompanyDomainEvent,
    expectedSequence?: number,
  ): Promise<AppendResult> {
    return this.#exclusive(event.companyId, async () => {
      const stream = await this.#load(event.companyId);
      if (expectedSequence !== undefined && stream.events.length !== expectedSequence) {
        throw new Error(
          `Sequence conflict: expected ${expectedSequence}, found ${stream.events.length}.`,
        );
      }
      if (stream.events.some(({ id }) => id === event.id)) {
        throw new Error(`Duplicate event ID: ${event.id}.`);
      }
      const next = { ...stream, events: [...stream.events, structuredClone(event)] };
      await this.#persist(next);
      return {
        sequence: next.events.length,
        storedAt: new Date().toISOString(),
      };
    });
  }

  async read(
    companyId: Identifier,
    options: EventReadOptions = {},
  ): Promise<readonly CompanyDomainEvent[]> {
    const stream = await this.#load(companyId);
    const afterSequence = options.afterSequence ?? 0;
    const selected = stream.events.slice(afterSequence).filter((event) =>
      !options.types || options.types.includes(event.type)
    );
    return structuredClone(selected);
  }

  async resetFixture(companyId: Identifier): Promise<void> {
    return this.#exclusive(companyId, async () => {
      const stream = await this.#load(companyId);
      if (stream.events.some(({ provenance }) => provenance !== "DEMO_FIXTURE")) {
        throw new Error("Production event streams cannot be reset.");
      }
      try {
        await unlink(this.#path(companyId));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    });
  }

  async exportBackup(companyId: Identifier): Promise<string> {
    const stream = await this.#load(companyId);
    const digest = this.#digest(stream);
    const backup: EventStoreBackup = { backupVersion: 1, ...stream, digest };
    return `${JSON.stringify(backup)}\n`;
  }

  async restoreBackup(companyId: Identifier, source: string): Promise<void> {
    return this.#exclusive(companyId, async () => {
      const current = await this.#load(companyId);
      if (current.events.length) throw new Error("Event store is not empty.");
      let candidate: EventStoreBackup;
      try {
        const parsed: unknown = JSON.parse(source);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        candidate = parsed as EventStoreBackup;
      } catch {
        throw new Error("Invalid event store backup.");
      }
      if (
        candidate.backupVersion !== 1 ||
        candidate.schemaVersion !== 1 ||
        candidate.companyId !== companyId ||
        !Array.isArray(candidate.events) ||
        !candidate.events.every((event) => isDomainEvent(event, companyId)) ||
        candidate.digest !== this.#digest({
          schemaVersion: candidate.schemaVersion,
          companyId: candidate.companyId,
          events: candidate.events,
        })
      ) {
        throw new Error("Event store backup digest or schema is invalid.");
      }
      await this.#persist({
        schemaVersion: 1,
        companyId,
        events: structuredClone(candidate.events),
      });
    });
  }

  async #load(companyId: Identifier): Promise<PersistedEventStream> {
    const path = this.#path(companyId);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: 1, companyId, events: [] };
      }
      throw error;
    }

    try {
      const parsed: unknown = JSON.parse(source);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const candidate = parsed as Record<string, unknown>;
      if (
        candidate.schemaVersion !== 1 ||
        candidate.companyId !== companyId ||
        !Array.isArray(candidate.events) ||
        !candidate.events.every((event) => isDomainEvent(event, companyId))
      ) {
        throw new Error();
      }
      return parsed as PersistedEventStream;
    } catch {
      throw new Error(`Corrupt event store for ${companyId}.`);
    }
  }

  async #persist(stream: PersistedEventStream): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const target = this.#path(stream.companyId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(stream)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }

  #path(companyId: Identifier): string {
    assertCompanyId(companyId);
    return join(this.#directory, `${companyId}.events.json`);
  }

  #digest(stream: PersistedEventStream): string {
    return `sha256:${createHash("sha256").update(JSON.stringify(stream)).digest("hex")}`;
  }

  async #exclusive<T>(companyId: Identifier, operation: () => Promise<T>): Promise<T> {
    const prior = this.#tails.get(companyId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
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
