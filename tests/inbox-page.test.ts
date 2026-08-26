import assert from "node:assert/strict";
import test from "node:test";

import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { DEMO_COMPANY } from "../adapters/demo/demo-company.ts";
import type { FormalWorkCatalog } from "../application/formal-agent-boss-api.ts";
import { inboxPage } from "../web/pages/operational-pages.ts";

async function state() {
  return createDemoComposition().runtime.snapshot();
}

const catalog: FormalWorkCatalog = {
  schemaVersion: 1,
  nextCursor: null,
  items: [
    {
      work: {
        id: "work-active", companyId: "demo-company", title: "Active market brief",
        goal: "Prepare the current market brief", scope: "AGENT", departmentId: "operations",
        projectId: null, agentId: "demo-researcher", requestedBy: "demo-boss",
        actionIds: ["research"], parentWorkId: null, accountableHumanId: "demo-boss",
        responsibilityContractId: "contract-one", runtimeConnectorId: "fixture-reference-one",
        status: "PENDING",
      },
      attempts: [{
        id: "attempt-active", workId: "work-active", status: "RUNNING", attemptNumber: 1,
        evidenceReferences: [], resultId: null, reconciliation: null, preparationStatus: "PREPARED",
      }],
    },
    {
      work: {
        id: "work-done", companyId: "demo-company", title: "Completed launch review",
        goal: "Review all launch evidence", scope: "AGENT", departmentId: "operations",
        projectId: null, agentId: "demo-operator", requestedBy: "demo-boss",
        actionIds: ["review"], parentWorkId: null, accountableHumanId: "demo-boss",
        responsibilityContractId: "contract-two", runtimeConnectorId: "fixture-reference-two",
        status: "PENDING",
      },
      attempts: [{
        id: "attempt-done", workId: "work-done", status: "SUCCEEDED", attemptNumber: 1,
        evidenceReferences: ["evidence-one"], resultId: "result-one", reconciliation: null,
        preparationStatus: "PREPARED",
      }],
    },
  ],
};

test("Inbox filters expose real assigned work from the latest server attempt", async () => {
  const html = inboxPage(await state(), DEMO_COMPANY, "en", "assigned", catalog);
  assert.match(html, /data-inbox-filter="assigned"[^>]+aria-selected="true"/);
  assert.match(html, /Active market brief/);
  assert.doesNotMatch(html, /Completed launch review/);
});

test("Inbox resolved filter uses terminal attempt status instead of the original WorkItem status", async () => {
  const html = inboxPage(await state(), DEMO_COMPANY, "en", "resolved", catalog);
  assert.match(html, /data-inbox-filter="resolved"[^>]+aria-selected="true"/);
  assert.match(html, /Completed launch review/);
  assert.doesNotMatch(html, /Active market brief/);
});
