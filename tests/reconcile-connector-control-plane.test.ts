import assert from "node:assert/strict";
import test from "node:test";
import { ReconcileConnectorControlPlane } from "../application/reconcile-connector-control-plane.ts";

const delivered = (id: string) => ({
  publicationId: id,
  partitionKey: "attempt-one",
  status: "DELIVERED" as const,
  code: "CONNECTOR_COMMAND_DELIVERED",
});

test("restart recovery delivers committed commands before collecting observations", async () => {
  const calls: string[] = [];
  let delivery = 0;
  const cycle = new ReconcileConnectorControlPlane({
    async recoverExpired() { calls.push("recover-expired"); },
    async deliver() {
      calls.push("deliver");
      delivery += 1;
      return delivery === 1 ? [delivered("resume-one")] : [];
    },
    async collectObservations() { calls.push("collect"); },
    async revokeSecretLeases() { calls.push("revoke-secrets"); },
  });

  assert.deepEqual(await cycle.execute(), [delivered("resume-one")]);
  assert.deepEqual(calls, [
    "recover-expired",
    "deliver",
    "collect",
    "deliver",
    "collect",
    "revoke-secrets",
  ]);
});

test("an observation failure cannot block a previously committed command", async () => {
  const calls: string[] = [];
  const cycle = new ReconcileConnectorControlPlane({
    async recoverExpired() { calls.push("recover-expired"); },
    async deliver() { calls.push("deliver-resume"); return [delivered("resume-one")]; },
    async collectObservations() { calls.push("collect-failed"); throw new Error("CONNECTOR_OBSERVATION_INVALID"); },
  });

  await assert.rejects(cycle.execute(), /CONNECTOR_OBSERVATION_INVALID/);
  assert.deepEqual(calls, ["recover-expired", "deliver-resume", "collect-failed"]);
});

test("commands created while collecting observations are delivered in the same cycle", async () => {
  const calls: string[] = [];
  let delivery = 0;
  const cycle = new ReconcileConnectorControlPlane({
    async recoverExpired() { calls.push("recover-expired"); },
    async deliver() {
      delivery += 1;
      calls.push(`deliver-${delivery}`);
      return delivery === 2 ? [delivered("pause-one")] : [];
    },
    async collectObservations() { calls.push("collect"); },
  });

  assert.deepEqual(await cycle.execute(), [delivered("pause-one")]);
  assert.deepEqual(calls, ["recover-expired", "deliver-1", "collect", "deliver-2", "collect"]);
});
