import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalEventStore } from "../adapters/storage/local-event-store.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";

function event(companyId: string, id: string): CompanyDomainEvent {
  return {
    id,
    companyId,
    type: "work.assigned",
    occurredAt: "2026-08-18T08:00:00.000Z",
    actorId: "human-one",
    payload: { workId: "work-one" },
    provenance: "PRODUCTION",
  };
}

test("local event store survives adapter restart and isolates companies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-events-"));
  const first = new LocalEventStore(directory);
  await first.append(event("company-one", "event-one"), 0);
  await first.append(event("company-two", "event-two"), 0);

  const restarted = new LocalEventStore(directory);
  assert.deepEqual(
    (await restarted.read("company-one")).map(({ id }) => id),
    ["event-one"],
  );
  assert.deepEqual(
    (await restarted.read("company-two")).map(({ id }) => id),
    ["event-two"],
  );
});

test("local event store rejects stale writers and duplicate event IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-events-"));
  const store = new LocalEventStore(directory);
  await store.append(event("company-one", "event-one"), 0);

  await assert.rejects(
    store.append(event("company-one", "event-two"), 0),
    /sequence conflict/i,
  );
  await assert.rejects(
    store.append(event("company-one", "event-one"), 1),
    /duplicate event/i,
  );
});

test("local event store fails closed on corrupt persisted state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-events-"));
  await writeFile(join(directory, "company-one.events.json"), "{not-json", "utf8");

  await assert.rejects(
    new LocalEventStore(directory).read("company-one"),
    /corrupt event store/i,
  );
});
