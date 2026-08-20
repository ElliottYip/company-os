import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalDurableControlPlaneStore } from "../adapters/storage/local-durable-control-plane-store.ts";
import type { CompanyDomainEvent } from "../core/control-plane.ts";

function event(id: string): CompanyDomainEvent {
  return {
    id,
    companyId: "company-one",
    type: "work-attempt.created",
    occurredAt: "2026-08-20T11:00:00.000Z",
    actorId: "human-one",
    payload: { attemptId: "attempt-one" },
    provenance: "PRODUCTION",
  };
}

function publication(id: string) {
  return {
    id,
    companyId: "company-one",
    topic: "connector.commands",
    partitionKey: "attempt-one",
    payload: { attemptId: "attempt-one", operation: "SUBMIT" },
    occurredAt: "2026-08-20T11:00:00.000Z",
  };
}

test("domain event and connector outbox message commit atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-durable-"));
  const store = new LocalDurableControlPlaneStore(directory);
  await store.commit({
    event: event("event-one"),
    publications: [publication("message-one")],
    expectedEventSequence: 0,
  });

  assert.deepEqual((await store.read("company-one")).map(({ id }) => id), ["event-one"]);
  assert.deepEqual(
    (await store.readPendingPublications("company-one", { afterSequence: 0, limit: 10 }))
      .map(({ id, sequence, status }) => ({ id, sequence, status })),
    [{ id: "message-one", sequence: 1, status: "PENDING" }],
  );

  await assert.rejects(store.commit({
    event: event("event-two"),
    publications: [publication("message-two")],
    expectedEventSequence: 0,
  }), /sequence conflict/i);
  assert.equal((await store.read("company-one")).length, 1);
  assert.equal((await store.readPendingPublications("company-one", {
    afterSequence: 0,
    limit: 10,
  })).length, 1);
});

test("outbox delivery and projection checkpoints survive restart and are idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-durable-"));
  const first = new LocalDurableControlPlaneStore(directory);
  await first.commit({
    event: event("event-one"),
    publications: [publication("message-one")],
    expectedEventSequence: 0,
  });
  await first.markPublicationDelivered(
    "company-one",
    "message-one",
    "2026-08-20T11:01:00.000Z",
  );
  await first.markPublicationDelivered(
    "company-one",
    "message-one",
    "2026-08-20T11:01:00.000Z",
  );
  await first.saveProjectionCheckpoint({
    companyId: "company-one",
    projectionName: "agent-boss",
    eventSequence: 1,
    expectedEventSequence: 0,
    updatedAt: "2026-08-20T11:02:00.000Z",
  });

  const restarted = new LocalDurableControlPlaneStore(directory);
  assert.equal((await restarted.readPendingPublications("company-one", {
    afterSequence: 0,
    limit: 10,
  })).length, 0);
  assert.deepEqual(await restarted.loadProjectionCheckpoint("company-one", "agent-boss"), {
    companyId: "company-one",
    projectionName: "agent-boss",
    eventSequence: 1,
    updatedAt: "2026-08-20T11:02:00.000Z",
  });
});

test("projection checkpoints reject gaps, rewinds, and competing writers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-durable-"));
  const store = new LocalDurableControlPlaneStore(directory);
  await store.append(event("event-one"), 0);
  await assert.rejects(store.saveProjectionCheckpoint({
    companyId: "company-one",
    projectionName: "agent-boss",
    eventSequence: 2,
    expectedEventSequence: 0,
    updatedAt: "2026-08-20T11:02:00.000Z",
  }), /checkpoint beyond event stream/i);
  await store.saveProjectionCheckpoint({
    companyId: "company-one",
    projectionName: "agent-boss",
    eventSequence: 1,
    expectedEventSequence: 0,
    updatedAt: "2026-08-20T11:02:00.000Z",
  });
  await assert.rejects(store.saveProjectionCheckpoint({
    companyId: "company-one",
    projectionName: "agent-boss",
    eventSequence: 0,
    expectedEventSequence: 1,
    updatedAt: "2026-08-20T11:03:00.000Z",
  }), /checkpoint rewind/i);
  await assert.rejects(store.saveProjectionCheckpoint({
    companyId: "company-one",
    projectionName: "agent-boss",
    eventSequence: 1,
    expectedEventSequence: 0,
    updatedAt: "2026-08-20T11:03:00.000Z",
  }), /checkpoint conflict/i);
});

test("legacy event streams migrate forward without modifying the rollback source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "company-os-durable-"));
  const legacyPath = join(directory, "company-one.events.json");
  const legacySource = `${JSON.stringify({
    schemaVersion: 1,
    companyId: "company-one",
    events: [event("event-one")],
  })}\n`;
  await writeFile(legacyPath, legacySource, "utf8");

  const store = new LocalDurableControlPlaneStore(directory);
  assert.deepEqual((await store.read("company-one")).map(({ id }) => id), ["event-one"]);
  await store.append(event("event-two"), 1);

  assert.equal(await readFile(legacyPath, "utf8"), legacySource);
  assert.deepEqual((await store.read("company-one")).map(({ id }) => id), [
    "event-one",
    "event-two",
  ]);
});

test("durable backup includes outbox/checkpoints and rejects tamper or overwrite", async () => {
  const sourceDirectory = await mkdtemp(join(tmpdir(), "company-os-durable-source-"));
  const source = new LocalDurableControlPlaneStore(sourceDirectory);
  await source.commit({ event: event("event-one"), publications: [publication("message-one")], expectedEventSequence: 0 });
  await source.saveProjectionCheckpoint({
    companyId: "company-one", projectionName: "agent-boss", eventSequence: 1,
    expectedEventSequence: 0, updatedAt: "2026-08-20T11:02:00.000Z",
  });
  const backup = await source.exportBackup("company-one");
  const targetDirectory = await mkdtemp(join(tmpdir(), "company-os-durable-target-"));
  const target = new LocalDurableControlPlaneStore(targetDirectory);
  await assert.rejects(
    target.restoreBackup("company-one", backup.replace("attempt-one", "attempt-tampered")),
    /backup digest or schema/i,
  );
  await target.restoreBackup("company-one", backup);
  assert.equal((await target.read("company-one")).length, 1);
  assert.equal((await target.readPendingPublications("company-one", { afterSequence: 0, limit: 10 })).length, 1);
  assert.equal((await target.loadProjectionCheckpoint("company-one", "agent-boss"))?.eventSequence, 1);
  await assert.rejects(target.restoreBackup("company-one", backup), /not empty/i);
});
