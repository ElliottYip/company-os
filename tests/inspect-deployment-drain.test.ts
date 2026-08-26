import assert from "node:assert/strict";
import test from "node:test";

import { inspectDeploymentDrain } from "../scripts/inspect-deployment-drain.ts";
import type { DeploymentDrainStatePort } from "../ports/deployment-drain-state-port.ts";

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

test("deployment drain inspector emits a secret-free exact digest and stable assessment", async () => {
  const first = await inspectDeploymentDrain({
    source: source({ attempt: { status: "SUCCEEDED", id: "attempt-one" } }),
    now: () => "2026-08-26T10:01:00.000Z",
  });
  const reordered = await inspectDeploymentDrain({
    source: source({ attempt: { id: "attempt-one", status: "SUCCEEDED" } }),
    now: () => "2026-08-26T10:02:00.000Z",
  });

  assert.equal(first.status, "DRAINED");
  assert.equal(first.restartAllowed, true);
  assert.match(first.exactSourceDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.exactSourceDigest, reordered.exactSourceDigest);
  assert.doesNotMatch(JSON.stringify(first), /operator-one|attempt-one|company-one/);
});
