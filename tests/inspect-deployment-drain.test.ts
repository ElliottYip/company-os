import assert from "node:assert/strict";
import test from "node:test";

import { inspectDeploymentDrain } from "../scripts/inspect-deployment-drain.ts";
import type { DeploymentDrainStatePort } from "../ports/deployment-drain-state-port.ts";
import type { InstanceMaintenancePort } from "../ports/instance-maintenance-port.ts";

function source(payload: Record<string, unknown>): DeploymentDrainStatePort {
  return {
    async capture() {
      return [{
        companyId: "company-one", eventSequence: 1, pendingPublicationCount: 0,
        events: [{
          id: "attempt-one", companyId: "company-one", type: "work-attempt.recorded",
          occurredAt: "2026-08-26T10:00:00.000Z", actorId: "operator-one",
          payload, provenance: "PRODUCTION",
        }],
      }];
    },
  };
}

const frozenMaintenance: Pick<InstanceMaintenancePort, "load"> = {
  async load() {
    return { schemaVersion: 1, mode: "DISPATCH_FROZEN", revision: 1,
      operationId: "upgrade-staging-01", authorizationReference: "change:approved-01",
      changedBy: "admin-one", changedAt: "2026-08-26T09:59:00.000Z" };
  },
};

test("deployment drain inspector emits a secret-free exact digest and stable assessment", async () => {
  const first = await inspectDeploymentDrain({
    source: source({ attempt: { status: "SUCCEEDED", id: "attempt-one" } }),
    maintenance: frozenMaintenance,
    now: () => "2026-08-26T10:01:00.000Z",
  });
  const reordered = await inspectDeploymentDrain({
    source: source({ attempt: { id: "attempt-one", status: "SUCCEEDED" } }),
    maintenance: frozenMaintenance,
    now: () => "2026-08-26T10:02:00.000Z",
  });

  assert.equal(first.status, "DRAINED");
  assert.equal(first.restartAllowed, true);
  assert.match(first.exactSourceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.exactSourceDigest, reordered.exactSourceDigest);
  assert.doesNotMatch(JSON.stringify(first), /operator-one|attempt-one|company-one/);
});

test("deployment drain inspector requires both authoritative supplied ports", async () => {
  await assert.rejects(inspectDeploymentDrain({ source: source({}) }), /DRAIN_SUPPLIED_PORTS_INCOMPLETE/);
});
