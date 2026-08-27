import assert from "node:assert/strict";
import test from "node:test";

import { ManageInstanceMaintenance } from "../application/manage-instance-maintenance.ts";
import { openInstanceMaintenanceState, type InstanceMaintenanceState } from "../core/instance-maintenance.ts";
import type { InstanceMaintenancePort } from "../ports/instance-maintenance-port.ts";

class MemoryMaintenance implements InstanceMaintenancePort {
  value: InstanceMaintenanceState = openInstanceMaintenanceState();
  readonly history: InstanceMaintenanceState[] = [];
  async load() { return structuredClone(this.value); }
  async replace(input: Parameters<InstanceMaintenancePort["replace"]>[0]) {
    if (input.expectedRevision !== this.value.revision) throw new Error("INSTANCE_MAINTENANCE_REVISION_CONFLICT");
    this.value = structuredClone(input.state); this.history.push(this.value); return structuredClone(this.value);
  }
}

function service(store: MemoryMaintenance, admin = true) {
  let id = 0;
  return new ManageInstanceMaintenance({
    identity: {
      async getCurrentIdentity() { return { actorId: "instance-admin", organizationId: "company-one",
        displayName: "Admin", assurance: "ENTERPRISE_ASSERTED" as const }; },
      async currentPrincipal() { return null; }, async authorize() { throw new Error("not used"); },
    },
    access: { async isInstanceAdmin() { return admin; } }, maintenance: store,
    now: () => "2026-08-26T18:00:00.000Z", nextId: () => `maintenance-event-${++id}`,
  });
}

const acceptance = {
  planId: "acceptance-plan-rc4",
  planDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  work: [{ companyId: "company-one", workId: "acceptance-work-oidc" }],
} as const;

test("instance admin freezes, opens a bounded acceptance window, then reopens dispatch", async () => {
  const store = new MemoryMaintenance(); const manager = service(store);
  const frozen = await manager.execute({ mode: "DISPATCH_FROZEN", expectedRevision: 0,
    operationId: "upgrade-staging-01", authorizationReference: "change:approved-upgrade-01" });
  assert.equal(frozen.mode, "DISPATCH_FROZEN");
  assert.equal(frozen.revision, 1);
  assert.equal(frozen.changedBy, "instance-admin");
  assert.equal(frozen.acceptance, null);
  const accepting = await manager.execute({ mode: "ACCEPTANCE_ONLY", expectedRevision: 1,
    operationId: "upgrade-staging-01", authorizationReference: "acceptance:approved-rc4-01",
    acceptance });
  assert.equal(accepting.mode, "ACCEPTANCE_ONLY");
  assert.deepEqual(accepting.acceptance, acceptance);
  const open = await manager.execute({ mode: "OPEN", expectedRevision: 2,
    operationId: "upgrade-staging-01", authorizationReference: "dispatch:reopen-approved-01" });
  assert.equal(open.mode, "OPEN");
  assert.equal(open.revision, 3);
  assert.equal(open.acceptance, null);
  assert.deepEqual(store.history.map(({ mode }) => mode), [
    "DISPATCH_FROZEN", "ACCEPTANCE_ONLY", "OPEN",
  ]);
});

test("instance maintenance rejects non-admin, stale, unchanged and weakly authorized changes", async () => {
  const store = new MemoryMaintenance();
  await assert.rejects(service(store, false).execute({ mode: "DISPATCH_FROZEN", expectedRevision: 0,
    operationId: "upgrade-staging-01", authorizationReference: "change:approved-upgrade-01" }),
  /INSTANCE_ADMIN_REQUIRED/);
  await assert.rejects(service(store).execute({ mode: "OPEN", expectedRevision: 0,
    operationId: "upgrade-staging-01", authorizationReference: "change:approved-upgrade-01" }),
  /INSTANCE_MAINTENANCE_MODE_UNCHANGED/);
  await assert.rejects(service(store).execute({ mode: "DISPATCH_FROZEN", expectedRevision: 3,
    operationId: "upgrade-staging-01", authorizationReference: "change:approved-upgrade-01" }),
  /INSTANCE_MAINTENANCE_REVISION_CONFLICT/);
  await assert.rejects(service(store).execute({ mode: "DISPATCH_FROZEN", expectedRevision: 0,
    operationId: "bad", authorizationReference: "x" }), /INSTANCE_MAINTENANCE_AUTHORIZATION_INVALID/);
  assert.equal(store.history.length, 0);
});

test("maintenance transition graph keeps acceptance and dispatch authorization separate", async () => {
  const store = new MemoryMaintenance(); const manager = service(store);
  await manager.execute({ mode: "DISPATCH_FROZEN", expectedRevision: 0,
    operationId: "upgrade-staging-01", authorizationReference: "change:approved-upgrade-01" });
  await assert.rejects(manager.execute({ mode: "OPEN", expectedRevision: 1,
    operationId: "upgrade-staging-01", authorizationReference: "dispatch:reopen-approved-01" }),
  /INSTANCE_MAINTENANCE_TRANSITION_INVALID/);
  await assert.rejects(manager.execute({ mode: "ACCEPTANCE_ONLY", expectedRevision: 1,
    operationId: "other-upgrade", authorizationReference: "acceptance:approved-rc4-01", acceptance }),
  /INSTANCE_MAINTENANCE_OPERATION_MISMATCH/);
  await assert.rejects(manager.execute({ mode: "ACCEPTANCE_ONLY", expectedRevision: 1,
    operationId: "upgrade-staging-01", authorizationReference: "change:approved-upgrade-01", acceptance }),
  /INSTANCE_MAINTENANCE_AUTHORIZATION_REUSED/);
  await assert.rejects(manager.execute({ mode: "ACCEPTANCE_ONLY", expectedRevision: 1,
    operationId: "upgrade-staging-01", authorizationReference: "acceptance:approved-empty-01",
    acceptance: { ...acceptance, work: [] } }), /INSTANCE_ACCEPTANCE_BINDING_INVALID/);
  assert.equal(store.history.length, 1);
});
