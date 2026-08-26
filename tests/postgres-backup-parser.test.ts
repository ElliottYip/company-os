import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseDurableBackupState } from "../adapters/persistence/postgres/postgres-event-store.ts";

function backup(overrides: Record<string, unknown> = {}): string {
  const state = {
    schemaVersion: 1,
    companyId: "company-one",
    events: [{
      id: "event-one", companyId: "company-one", type: "organization.registered",
      occurredAt: "2026-08-25T00:00:00.000Z", actorId: "human-one", payload: {}, provenance: "PRODUCTION",
    }],
    outbox: [],
    checkpoints: {},
    ...overrides,
  };
  const digest = `sha256:${createHash("sha256").update(JSON.stringify(state)).digest("hex")}`;
  return JSON.stringify({ backupVersion: 1, ...state, digest });
}

test("durable backup parser returns a detached tenant-bound state", () => {
  assert.equal(parseDurableBackupState(backup(), "company-one").events[0]?.id, "event-one");
  assert.throws(() => parseDurableBackupState(backup(), "company-two"), /DURABLE_BACKUP_INVALID/);
});

test("durable backup parser rejects malformed nested records with one stable error", () => {
  for (const source of [
    backup({ events: [null] }),
    backup({ events: [{ id: "event-one", companyId: "company-one", type: "event", occurredAt: "bad",
      actorId: "human-one", payload: {}, provenance: "PRODUCTION" }] }),
    backup({ outbox: [null] }),
    backup({ outbox: [{ id: "publication-one", companyId: "company-one", sequence: 1, topic: "work",
      partitionKey: "company-one", payload: {}, occurredAt: "2026-08-25T00:00:00.000Z",
      status: "DELIVERED", deliveredAt: null }] }),
    backup({ checkpoints: { projection: null } }),
    backup({ checkpoints: { projection: { companyId: "company-one", projectionName: "projection",
      eventSequence: 1, updatedAt: "bad" } } }),
  ]) {
    assert.throws(() => parseDurableBackupState(source), /DURABLE_BACKUP_INVALID/);
  }
});
