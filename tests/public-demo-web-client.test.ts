import assert from "node:assert/strict";
import test from "node:test";

import { createPublicDemoClient } from "../web/public-demo-client.ts";

const snapshot = {
  generation: 1,
  revision: 0,
  createdAt: "2026-08-27T10:00:00.000Z",
  expiresAt: "2026-08-27T14:00:00.000Z",
  company: { id: "demo-company-one", name: "Coral Labs · Demo Fixture" },
  agents: [],
  work: [],
  commercial: { subscriptions: [], credentials: [], renewals: [], usage: [] },
  governed: {
    phase: "READY",
    approvalRequestId: null,
    evidenceReferences: [],
    resultReference: null,
    costCents: 0,
  },
  provenance: "DEMO_FIXTURE",
} as const;

test("public Demo Web client keeps the server session in HttpOnly cookies", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const client = createPublicDemoClient("https://anc.example", async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json(snapshot);
  });

  await client.create();
  await client.action({
    action: "REQUEST_RENEWAL",
    targetType: "CREDENTIAL",
    targetId: "credential-one",
    reason: "Renew before exhibition.",
  });

  assert.equal(calls[0]?.url, "https://anc.example/api/demo/v2/sessions");
  assert.equal(calls[0]?.init?.credentials, "include");
  assert.equal(calls[1]?.url, "https://anc.example/api/demo/v2/actions");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.doesNotMatch(String(calls[1]?.init?.body), /sessionId|companyId/);
});

test("public Demo Web client rejects a response that leaks the session token", async () => {
  const client = createPublicDemoClient("", async () => Response.json({
    ...snapshot,
    sessionId: "forbidden",
  }));
  await assert.rejects(client.read(), /PUBLIC_DEMO_RESPONSE_INVALID/);
});

