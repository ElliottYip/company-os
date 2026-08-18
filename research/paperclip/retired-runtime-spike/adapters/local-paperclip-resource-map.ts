import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Identifier } from "../../core/control-plane.ts";
import type {
  PaperclipResourceKind,
  PaperclipResourceMap,
} from "./paperclip-generic-work-adapter.ts";

interface ResourceBinding {
  readonly kind: PaperclipResourceKind;
  readonly companyOsId: Identifier;
  readonly upstreamId: string;
}

interface PersistedResourceMap {
  readonly schemaVersion: 1;
  readonly companyId: Identifier;
  readonly bindings: readonly ResourceBinding[];
}

interface ResourceMapBackup extends PersistedResourceMap {
  readonly backupVersion: 1;
  readonly digest: string;
}

const PORTABLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const UPSTREAM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const KINDS = new Set<PaperclipResourceKind>(["company", "agent", "goal", "work", "run", "run-work"]);

function assertCompanyOsId(value: string, label: string) {
  if (!PORTABLE_ID.test(value)) throw new Error(`Invalid ${label}.`);
}

function assertUpstreamId(value: string) {
  if (!UPSTREAM_ID.test(value)) throw new Error("Invalid upstream resource ID.");
}

function isBinding(value: unknown): value is ResourceBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return KINDS.has(input.kind as PaperclipResourceKind) &&
    typeof input.companyOsId === "string" && PORTABLE_ID.test(input.companyOsId) &&
    typeof input.upstreamId === "string" && UPSTREAM_ID.test(input.upstreamId);
}

export class LocalPaperclipResourceMap implements PaperclipResourceMap {
  readonly #directory: string;
  readonly #tails = new Map<Identifier, Promise<void>>();

  constructor(directory: string) {
    if (!directory.trim()) throw new Error("Paperclip resource-map directory is required.");
    this.#directory = directory;
  }

  async getUpstreamId(
    companyId: Identifier,
    kind: PaperclipResourceKind,
    companyOsId: Identifier,
  ): Promise<string | null> {
    assertCompanyOsId(companyOsId, "Company OS resource ID");
    return (await this.#load(companyId)).bindings.find((binding) =>
      binding.kind === kind && binding.companyOsId === companyOsId
    )?.upstreamId ?? null;
  }

  async getCompanyOsId(
    companyId: Identifier,
    kind: PaperclipResourceKind,
    upstreamId: string,
  ): Promise<Identifier | null> {
    assertUpstreamId(upstreamId);
    return (await this.#load(companyId)).bindings.find((binding) =>
      binding.kind === kind && binding.upstreamId === upstreamId
    )?.companyOsId ?? null;
  }

  async bind(
    companyId: Identifier,
    kind: PaperclipResourceKind,
    companyOsId: Identifier,
    upstreamId: string,
  ): Promise<void> {
    assertCompanyOsId(companyOsId, "Company OS resource ID");
    assertUpstreamId(upstreamId);
    return this.#exclusive(companyId, async () => {
      const map = await this.#load(companyId);
      const byCompanyOs = map.bindings.find((binding) =>
        binding.kind === kind && binding.companyOsId === companyOsId
      );
      const byUpstream = map.bindings.find((binding) =>
        binding.kind === kind && binding.upstreamId === upstreamId
      );
      if (byCompanyOs?.upstreamId === upstreamId && byUpstream?.companyOsId === companyOsId) return;
      if (byCompanyOs || byUpstream) throw new Error("Paperclip resource mapping conflict.");
      await this.#persist({
        ...map,
        bindings: [...map.bindings, { kind, companyOsId, upstreamId }],
      });
    });
  }

  async exportBackup(companyId: Identifier): Promise<string> {
    const map = await this.#load(companyId);
    const backup: ResourceMapBackup = {
      backupVersion: 1,
      ...map,
      digest: this.#digest(map),
    };
    return `${JSON.stringify(backup)}\n`;
  }

  async restoreBackup(companyId: Identifier, source: string): Promise<void> {
    return this.#exclusive(companyId, async () => {
      const current = await this.#load(companyId);
      if (current.bindings.length) throw new Error("Paperclip resource map is not empty.");
      let backup: ResourceMapBackup;
      try {
        backup = JSON.parse(source) as ResourceMapBackup;
      } catch {
        throw new Error("Invalid Paperclip resource-map backup.");
      }
      const map: PersistedResourceMap = {
        schemaVersion: backup.schemaVersion,
        companyId: backup.companyId,
        bindings: backup.bindings,
      };
      if (backup.backupVersion !== 1 || map.schemaVersion !== 1 || map.companyId !== companyId ||
          !Array.isArray(map.bindings) || !map.bindings.every(isBinding) ||
          backup.digest !== this.#digest(map) || this.#hasConflicts(map.bindings)) {
        throw new Error("Paperclip resource-map backup digest or schema is invalid.");
      }
      await this.#persist(map);
    });
  }

  async #load(companyId: Identifier): Promise<PersistedResourceMap> {
    assertCompanyOsId(companyId, "company ID");
    try {
      const source = await readFile(this.#path(companyId), "utf8");
      const parsed = JSON.parse(source) as PersistedResourceMap;
      if (parsed.schemaVersion !== 1 || parsed.companyId !== companyId ||
          !Array.isArray(parsed.bindings) || !parsed.bindings.every(isBinding) ||
          this.#hasConflicts(parsed.bindings)) throw new Error();
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { schemaVersion: 1, companyId, bindings: [] };
      }
      throw new Error(`Corrupt Paperclip resource map for ${companyId}.`);
    }
  }

  async #persist(map: PersistedResourceMap) {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
    const target = this.#path(map.companyId);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(map)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, target);
  }

  #path(companyId: Identifier) {
    return join(this.#directory, `${companyId}.paperclip-map.json`);
  }

  #digest(map: PersistedResourceMap) {
    return `sha256:${createHash("sha256").update(JSON.stringify(map)).digest("hex")}`;
  }

  #hasConflicts(bindings: readonly ResourceBinding[]) {
    const local = new Set<string>();
    const upstream = new Set<string>();
    for (const binding of bindings) {
      const localKey = `${binding.kind}:${binding.companyOsId}`;
      const upstreamKey = `${binding.kind}:${binding.upstreamId}`;
      if (local.has(localKey) || upstream.has(upstreamKey)) return true;
      local.add(localKey);
      upstream.add(upstreamKey);
    }
    return false;
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
