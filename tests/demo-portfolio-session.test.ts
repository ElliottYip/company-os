import assert from "node:assert/strict";
import test from "node:test";

import { createDemoPortfolioFixture } from "../adapters/demo/create-demo-portfolio-fixture.ts";
import { InMemoryDemoSessionStore } from "../adapters/storage/in-memory-demo-session-store.ts";
import { DemoPortfolioSessions } from "../application/demo-portfolio-sessions.ts";

function sessions() {
  let session = 0;
  let company = 0;
  let now = Date.parse("2026-08-27T10:00:00.000Z");
  const service = new DemoPortfolioSessions({
    store: new InMemoryDemoSessionStore(),
    createFixture: createDemoPortfolioFixture,
    nextSessionId: () => `demo_session_${++session}_opaque_0123456789abcdef`,
    nextCompanyId: () => `demo-company-${++company}`,
    now: () => new Date(now).toISOString(),
    timeToLiveMilliseconds: 60_000,
  });
  return { service, advance: (milliseconds: number) => { now += milliseconds; } };
}

test("each visitor receives an isolated server-owned Agent Portfolio", async () => {
  const { service } = sessions();
  const first = await service.create();
  const second = await service.create();

  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(first.company.id, second.company.id);
  assert.equal(first.agents.filter(({ agentClass }) => agentClass === "PERSONAL").length, 3);
  assert.equal(first.agents.filter(({ agentClass }) => agentClass === "SHARED").length, 4);
  assert.equal(first.agents.filter(({ agentClass }) => agentClass === "FEDERATED_RUNTIME").length, 1);
  assert.equal(first.work.some(({ mode }) => mode === "OBSERVED"), true);
  assert.equal(first.work.some(({ mode }) => mode === "FEDERATED"), true);
  assert.equal(first.provenance, "DEMO_FIXTURE");
});

test("renewal mutation is scoped by opaque session and cannot select a company", async () => {
  const { service } = sessions();
  const first = await service.create();
  const second = await service.create();

  const changed = await service.requestRenewal(first.sessionId, {
    targetType: "CREDENTIAL",
    targetId: "credential-elliott",
    reason: "Renew before the exhibition walkthrough.",
  });

  assert.equal(changed.commercial.renewals.length, 1);
  assert.equal(changed.commercial.renewals[0]?.companyId, first.company.id);
  assert.equal((await service.read(second.sessionId)).commercial.renewals.length, 0);
});

test("governed approval is deterministic and remains isolated from other visitors", async () => {
  const { service } = sessions();
  const first = await service.create();
  const second = await service.create();

  assert.equal((await service.triggerGovernedWork(first.sessionId)).governed.phase, "AWAITING_APPROVAL");
  assert.equal((await service.decide(first.sessionId, "APPROVED")).governed.phase, "APPROVED");
  assert.equal((await service.read(second.sessionId)).governed.phase, "READY");
});

test("reset restores only one visitor and increments its generation", async () => {
  const { service } = sessions();
  const first = await service.create();
  const second = await service.create();
  await service.triggerGovernedWork(first.sessionId);
  await service.requestRenewal(second.sessionId, {
    targetType: "SUBSCRIPTION",
    targetId: "subscription-mia",
    reason: "Renew the shared exhibition fixture.",
  });

  const reset = await service.reset(first.sessionId);
  assert.equal(reset.generation, 2);
  assert.equal(reset.governed.phase, "READY");
  assert.equal((await service.read(second.sessionId)).commercial.renewals.length, 1);
});

test("an expired or unknown session recovers as a fresh isolated Demo company", async () => {
  const { service, advance } = sessions();
  const initial = await service.create();
  advance(60_001);

  await assert.rejects(service.read(initial.sessionId), /DEMO_SESSION_EXPIRED/);
  const recovered = await service.recover(initial.sessionId);
  assert.notEqual(recovered.sessionId, initial.sessionId);
  assert.notEqual(recovered.company.id, initial.company.id);
  assert.equal(recovered.generation, 1);
  assert.equal(recovered.governed.phase, "READY");
});

