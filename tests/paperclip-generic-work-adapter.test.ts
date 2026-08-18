import assert from "node:assert/strict";
import test from "node:test";
import type { Identifier } from "../core/control-plane.ts";
import {
  PaperclipGenericWorkAdapter,
  type PaperclipHttpTransport,
  type PaperclipResourceKind,
  type PaperclipResourceMap,
} from "../adapters/paperclip/paperclip-generic-work-adapter.ts";

class MemoryResourceMap implements PaperclipResourceMap {
  readonly #out = new Map<string, string>();
  readonly #back = new Map<string, Identifier>();

  seed(kind: PaperclipResourceKind, companyOsId: Identifier, upstreamId: string) {
    this.#out.set(`${kind}:${companyOsId}`, upstreamId);
    this.#back.set(`${kind}:${upstreamId}`, companyOsId);
  }

  async getUpstreamId(kind: PaperclipResourceKind, companyOsId: Identifier) {
    return this.#out.get(`${kind}:${companyOsId}`) ?? null;
  }

  async getCompanyOsId(kind: PaperclipResourceKind, upstreamId: string) {
    return this.#back.get(`${kind}:${upstreamId}`) ?? null;
  }

  async bind(kind: PaperclipResourceKind, companyOsId: Identifier, upstreamId: string) {
    this.seed(kind, companyOsId, upstreamId);
  }
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "22222222-2222-4222-8222-222222222222",
    goalId: "33333333-3333-4333-8333-333333333333",
    assigneeAgentId: "44444444-4444-4444-8444-444444444444",
    title: "Prepare evidence-backed brief",
    status: "todo",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

test("Paperclip adapter creates generic work through the documented issue API", async () => {
  const resources = new MemoryResourceMap();
  resources.seed("company", "company-coral", "22222222-2222-4222-8222-222222222222");
  resources.seed("goal", "goal-brief", "33333333-3333-4333-8333-333333333333");
  resources.seed("agent", "agent-research", "44444444-4444-4444-8444-444444444444");
  const requests: Parameters<PaperclipHttpTransport["request"]>[0][] = [];
  const adapter = new PaperclipGenericWorkAdapter({
    resources,
    transport: {
      async request(input) {
        requests.push(input);
        return { status: 201, body: issue() };
      },
    },
  });

  const result = await adapter.createWork({
    id: "work-brief",
    companyId: "company-coral",
    title: "Prepare evidence-backed brief",
    description: "Use the approved data scope.",
    goalId: "goal-brief",
    assigneeId: "agent-research",
    idempotencyKey: "company-coral:work-brief:v1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.id, "work-brief");
  assert.equal(result.value.status, "READY");
  assert.equal(await resources.getUpstreamId("work", "work-brief"), issue().id);
  assert.deepEqual(requests[0], {
    method: "POST",
    path: "/api/companies/22222222-2222-4222-8222-222222222222/issues",
    body: {
      title: "Prepare evidence-backed brief",
      description: "Use the approved data scope.",
      goalId: "33333333-3333-4333-8333-333333333333",
      assigneeAgentId: "44444444-4444-4444-8444-444444444444",
      idempotencyKey: "company-coral:work-brief:v1",
    },
  });
});

test("Paperclip adapter rejects cross-company or malformed issue projections", async () => {
  const resources = new MemoryResourceMap();
  resources.seed("company", "company-coral", "22222222-2222-4222-8222-222222222222");
  resources.seed("work", "work-brief", issue().id);
  const adapter = new PaperclipGenericWorkAdapter({
    resources,
    transport: { async request() { return { status: 200, body: issue({ companyId: "other-company" }) }; } },
  });

  const result = await adapter.getWork("company-coral", "work-brief");
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "UPSTREAM_ISSUE_CONTRACT_INVALID",
      category: "UPSTREAM_UNAVAILABLE",
      retryable: false,
    },
  });
});

test("Paperclip adapter consumes durable run events without message, payload, or secrets", async () => {
  const resources = new MemoryResourceMap();
  resources.seed("company", "company-coral", "22222222-2222-4222-8222-222222222222");
  resources.seed("run", "run-brief", "55555555-5555-4555-8555-555555555555");
  resources.seed("run-work", "work-brief", "55555555-5555-4555-8555-555555555555");
  const adapter = new PaperclipGenericWorkAdapter({
    resources,
    transport: {
      async request() {
        return {
          status: 200,
          body: [{
            seq: 7,
            runId: "55555555-5555-4555-8555-555555555555",
            eventType: "heartbeat.run.status",
            stream: "system",
            level: "info",
            message: "original output remains upstream",
            payload: { sessionToken: "must-not-cross" },
            createdAt: "2026-08-18T00:01:00.000Z",
          }],
        };
      },
    },
  });

  const result = await adapter.listRunEvents({
    companyId: "company-coral",
    runId: "run-brief",
    afterSequence: 6,
    limit: 200,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.items, [{
    sequence: 7,
    runId: "run-brief",
    workId: "work-brief",
    type: "heartbeat.run.status",
    occurredAt: "2026-08-18T00:01:00.000Z",
    attributes: { stream: "system", level: "info" },
  }]);
  assert.doesNotMatch(JSON.stringify(result.value), /sessionToken|must-not-cross|original output/);
});
