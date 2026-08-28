import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventStore } from "../adapters/storage/in-memory-event-store.ts";
import { RegisterExternalWork } from "../application/register-external-work.ts";

function service() {
  let sequence = 0;
  const events = new InMemoryEventStore();
  return {
    events,
    work: new RegisterExternalWork({
      events,
      nextId: () => `portfolio-event-${++sequence}`,
    }),
  };
}

const observed = {
  id: "portfolio-work-one",
  companyId: "company-one",
  agentId: "agent-one",
  initiatedBy: "human-one",
  title: "Competitive research",
  summary: "Compare the approved public product pages.",
  status: "COMPLETED",
  source: {
    connectorId: "source-connector",
    externalId: "thread-work-42",
    channelReference: "channel-research",
    threadReference: "thread-42",
    workspaceReference: null,
    returnUrl: "https://reference.example/threads/42",
  },
  evidenceReferences: ["evidence-one"],
  resultReference: "result-one",
  costCents: 84,
  sourceRevision: 1,
  synchronizedAt: "2026-08-27T08:00:00.000Z",
  provenance: "DEMO_FIXTURE",
} as const;

test("Observed Work registration is idempotent by company, Connector, and external ID", async () => {
  const { events, work } = service();
  assert.deepEqual(await work.registerObserved(observed), {
    status: "RECORDED",
    record: { ...observed, mode: "OBSERVED" },
  });
  assert.deepEqual(await work.registerObserved(observed), {
    status: "REPLAYED",
    record: { ...observed, mode: "OBSERVED" },
  });
  assert.equal((await events.read("company-one", {
    types: ["portfolio-work.recorded"],
  })).length, 1);
});

test("Observed Work rejects conflicting replay and never accepts private payload fields", async () => {
  const { work } = service();
  await work.registerObserved(observed);
  await assert.rejects(work.registerObserved({
    ...observed,
    summary: "Changed content for the same immutable source record.",
  }), /OBSERVED_WORK_REFERENCE_CONFLICT/);

  await assert.rejects(work.registerObserved({
    ...observed,
    id: "portfolio-work-private",
    source: { ...observed.source, externalId: "thread-work-private" },
    privateContent: "must never enter ANC",
  } as typeof observed), /EXTERNAL_WORK_FIELDS_INVALID/);
});

test("Federated Work accepts monotonic source revisions without dispatch", async () => {
  const { work } = service();
  const first = {
    ...observed,
    id: "portfolio-work-federated",
    initiatedBy: null,
    source: {
      ...observed.source,
      externalId: "external-run-one",
      channelReference: null,
      threadReference: null,
      workspaceReference: "workspace-one",
    },
    status: "WORKING",
    resultReference: null,
    evidenceReferences: [],
    sourceRevision: 4,
  } as const;
  assert.equal((await work.synchronizeFederated(first)).status, "RECORDED");
  assert.equal((await work.synchronizeFederated(first)).status, "REPLAYED");

  const updated = {
    ...first,
    status: "COMPLETED",
    resultReference: "artifact-one",
    sourceRevision: 5,
    synchronizedAt: "2026-08-27T08:05:00.000Z",
  } as const;
  assert.equal((await work.synchronizeFederated(updated)).status, "UPDATED");

  await assert.rejects(work.synchronizeFederated({
    ...first,
    sourceRevision: 3,
  }), /FEDERATED_WORK_SOURCE_REVISION_STALE/);

  assert.deepEqual(await work.list("company-one"), [
    { ...updated, mode: "FEDERATED" },
  ]);
});

test("cross-source Work contains bounded references, not external sessions or raw artifacts", async () => {
  const { work } = service();
  await assert.rejects(work.synchronizeFederated({
    ...observed,
    id: "portfolio-work-invalid",
    source: {
      ...observed.source,
      externalId: "external-run-invalid",
      workspaceReference: "workspace-one",
      returnUrl: "https://user:secret@reference.example/run",
    },
  }), /EXTERNAL_WORK_RETURN_URL_INVALID/);

  await assert.rejects(work.registerObserved({
    ...observed,
    id: "portfolio-work-long",
    source: { ...observed.source, externalId: "thread-work-long" },
    summary: "x".repeat(2_001),
  }), /EXTERNAL_WORK_SUMMARY_INVALID/);
});

