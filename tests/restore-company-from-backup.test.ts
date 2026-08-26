import assert from "node:assert/strict";
import test from "node:test";

import { RestoreCompanyFromBackup } from "../application/restore-company-from-backup.ts";
import type { CompanyRestoreStorePort } from "../ports/company-restore-store-port.ts";

function fixtureStore(calls: unknown[]): CompanyRestoreStorePort {
  return {
    async inspectOwnedCompanyRestore(input) {
      calls.push({ operation: "inspect", input });
      return {
        companyId: "company-one", name: "Company One", purpose: "Keep humans accountable.", locale: "en-US",
        actorUserId: input.actorUserId, identityBinding: "EXACT", eventCount: 1,
        deliveredPublicationCount: 0, checkpointCount: 0, humanCount: 1, agentCount: 0,
      };
    },
    async restoreOwnedCompany(input) {
      calls.push(input);
      return {
        companyId: "company-one",
        membershipId: input.membershipId,
        permissionGrantIds: input.permissionGrants.map(({ id }) => id),
        ownerUserId: input.actorUserId,
        name: "Company One",
        purpose: "Keep humans accountable.",
        locale: "en-US",
      };
    },
  };
}

test("company restore creates one bounded atomic store command with owner permissions", async () => {
  const calls: unknown[] = [];
  let sequence = 0;
  const service = new RestoreCompanyFromBackup({
    store: fixtureStore(calls),
    nextId: () => `restore-${++sequence}`,
  });
  const source = JSON.stringify({ backupVersion: 1, companyId: "company-one" });

  const restored = await service.execute({ userId: "human-one", sessionId: "session-one" }, source);

  assert.equal(restored.companyId, "company-one");
  assert.equal(restored.ownerUserId, "human-one");
  assert.equal(restored.permissionGrantIds.length, 8);
  assert.equal(calls.length, 1);
  const command = calls[0] as Parameters<CompanyRestoreStorePort["restoreOwnedCompany"]>[0];
  assert.equal(command.source, source);
  assert.equal(command.actorUserId, "human-one");
  assert.equal(command.membershipId, "restore-1");
  assert.deepEqual(command.permissionGrants.map(({ permissionKey }) => permissionKey), [
    "agents:create", "agents:configure", "skills:create", "environments:manage", "users:invite",
    "users:manage_permissions", "tasks:assign", "joins:approve",
  ]);
});

test("company restore inspection is read-only and does not allocate persistence IDs", async () => {
  const calls: unknown[] = [];
  let allocated = 0;
  const service = new RestoreCompanyFromBackup({
    store: fixtureStore(calls), nextId: () => { allocated += 1; return `restore-${allocated}`; },
  });
  const source = JSON.stringify({ backupVersion: 1, companyId: "company-one" });
  const inspected = await service.inspect({ userId: "human-one", sessionId: "session-one" }, source);
  assert.equal(inspected.identityBinding, "EXACT");
  assert.equal(inspected.companyId, "company-one");
  assert.equal(allocated, 0);
  assert.deepEqual(calls, [{ operation: "inspect", input: { source, actorUserId: "human-one" } }]);
});

test("company restore rejects an invalid actor, empty backup, oversized backup, or invalid generated IDs", async () => {
  const calls: unknown[] = [];
  const valid = new RestoreCompanyFromBackup({ store: fixtureStore(calls), nextId: () => "valid-id" });
  assert.throws(() => valid.execute({ userId: "../../human", sessionId: "session-one" }, "{}"),
    /AUTHENTICATED_USER_ID_INVALID/);
  assert.throws(() => valid.execute({ userId: "human-one", sessionId: "session-one" }, ""),
    /DURABLE_BACKUP_INVALID/);
  assert.throws(() => valid.execute({ userId: "human-one", sessionId: "session-one" }, "x".repeat(8 * 1_024 * 1_024 + 1)),
    /DURABLE_BACKUP_INVALID/);
  const invalidId = new RestoreCompanyFromBackup({ store: fixtureStore(calls), nextId: () => "INVALID ID" });
  assert.throws(() => invalidId.execute({ userId: "human-one", sessionId: "session-one" }, "{}"),
    /MEMBERSHIP_ID_INVALID/);
  assert.deepEqual(calls, []);
});
