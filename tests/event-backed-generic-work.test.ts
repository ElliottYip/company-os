import assert from "node:assert/strict";
import test from "node:test";
import { EventBackedGenericWorkStore } from "../adapters/storage/event-backed-generic-work-store.ts";
import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";

test("generic work persistence is idempotent and paginated without an external runtime", async () => {
  const events = new InMemoryEventStore();
  const store = new EventBackedGenericWorkStore(events, () => "2026-08-24T10:00:00.000Z", () => "event-one");
  const command = {
    id: "work-one", companyId: "company-one", title: "Prepare brief", description: "Brief",
    goalId: null, assigneeId: "agent-one", idempotencyKey: "company-one:work-one:v1",
  } as const;
  assert.equal((await store.createWork(command)).ok, true);
  assert.equal((await store.createWork(command)).ok, true);
  const page = await store.listWork({ companyId: "company-one", limit: 10 });
  assert.equal(page.ok && page.value.items.length, 1);
  assert.equal((await events.read("company-one", { types: ["generic-work.created"] })).length, 1);
});
