import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createDemoPortfolioFixture } from "../adapters/demo/create-demo-portfolio-fixture.ts";
import { createDemoComposition } from "../adapters/demo/create-demo-composition.ts";
import { createCompanyOsHttpService } from "../adapters/http/company-os-http-service.ts";
import { PublicDemoRequestLimiter } from "../adapters/http/public-demo-request-limiter.ts";
import { InMemoryDemoSessionStore } from "../adapters/storage/in-memory-demo-session-store.ts";
import { DemoPortfolioSessions } from "../application/demo-portfolio-sessions.ts";

async function withService(
  run: (baseUrl: string) => Promise<void>,
  input: { createLimit?: number; sessionLimit?: number } = {},
) {
  let session = 0;
  let company = 0;
  let formalCalls = 0;
  const demo = new DemoPortfolioSessions({
    store: new InMemoryDemoSessionStore(),
    createFixture: createDemoPortfolioFixture,
    nextSessionId: () => `demo_session_${++session}_opaque_0123456789abcdef`,
    nextCompanyId: () => `demo-company-${++company}`,
    now: () => "2026-08-27T10:00:00.000Z",
    timeToLiveMilliseconds: 60_000,
  });
  const server = createCompanyOsHttpService({
    runtime: createDemoComposition().runtime,
    deploymentProfile: "managed-cloud",
    deploymentExposure: "public",
    serviceMode: "FORMAL",
    allowedOrigins: ["https://demo.example"],
    publicDemoSessions: demo,
    publicDemoRequestLimiter: new PublicDemoRequestLimiter({
      maximumCreationsPerWindow: input.createLimit ?? 100,
      maximumRequestsPerSessionPerWindow: input.sessionLimit ?? 100,
      windowMilliseconds: 60_000,
      now: () => 1_000,
    }),
    formalApi: {
      async getAgentBoss() { formalCalls += 1; return {}; },
      async getAdministration() { formalCalls += 1; return { forbidden: false }; },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
  try {
    await run(`http://127.0.0.1:${address.port}`);
    assert.equal(formalCalls, 0);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function cookie(response: Response): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  assert.match(value, /^company-os-demo-session=/);
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /Path=\/api\/demo\/v2/);
  assert.match(value, /Secure/);
  return value.split(";")[0]!;
}

test("public Demo creates an isolated cookie session without exposing its token in JSON", async () => {
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/demo/v2/sessions`, {
      method: "POST",
      headers: { origin: "https://demo.example" },
    });
    assert.equal(created.status, 201);
    const sessionCookie = cookie(created);
    const body = await created.json() as Record<string, unknown>;
    assert.equal("sessionId" in body, false);
    assert.equal((body.company as { name: string }).name, "Coral Labs · Demo Fixture");

    const read = await fetch(`${baseUrl}/api/demo/v2/session`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(read.status, 200);
    assert.equal((await read.json() as { generation: number }).generation, 1);
  });
});

test("Demo actions derive company from the cookie and keep concurrent visitors isolated", async () => {
  await withService(async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/demo/v2/sessions`, {
      method: "POST", headers: { origin: "https://demo.example" },
    });
    const second = await fetch(`${baseUrl}/api/demo/v2/sessions`, {
      method: "POST", headers: { origin: "https://demo.example" },
    });
    const firstCookie = cookie(first);
    const secondCookie = cookie(second);

    const changed = await fetch(`${baseUrl}/api/demo/v2/actions`, {
      method: "POST",
      headers: {
        cookie: firstCookie,
        origin: "https://demo.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "REQUEST_RENEWAL",
        targetType: "CREDENTIAL",
        targetId: "credential-elliott",
        reason: "Renew before exhibition.",
      }),
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json() as {
      commercial: { renewals: unknown[] };
    }).commercial.renewals.length, 1);

    const unchanged = await fetch(`${baseUrl}/api/demo/v2/session`, {
      headers: { cookie: secondCookie },
    });
    assert.equal((await unchanged.json() as {
      commercial: { renewals: unknown[] };
    }).commercial.renewals.length, 0);
  });
});

test("Demo cookie is rejected before any formal administration handler", async () => {
  await withService(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/demo/v2/sessions`, {
      method: "POST", headers: { origin: "https://demo.example" },
    });
    const response = await fetch(
      `${baseUrl}/api/v1/companies/demo-company-1/administration`,
      { headers: { cookie: cookie(created) } },
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { error: { code: string } }).error.code,
      "DEMO_IDENTITY_FORBIDDEN");
  });
});

test("Demo mutations reject an unapproved origin", async () => {
  await withService(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/demo/v2/sessions`, {
      method: "POST", headers: { origin: "https://attacker.example" },
    });
    assert.equal(response.status, 403);
  });
});

test("Demo returns 429 when anonymous creation capacity is consumed", async () => {
  await withService(async (baseUrl) => {
    const headers = { origin: "https://demo.example" };
    assert.equal((await fetch(`${baseUrl}/api/demo/v2/sessions`, { method: "POST", headers })).status, 201);
    const limited = await fetch(`${baseUrl}/api/demo/v2/sessions`, { method: "POST", headers });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.equal((await limited.json() as { error: { code: string } }).error.code,
      "PUBLIC_DEMO_RATE_LIMITED");
  }, { createLimit: 1 });
});

test("Demo limits one session without consuming another visitor budget", async () => {
  await withService(async (baseUrl) => {
    const headers = { origin: "https://demo.example" };
    const first = await fetch(`${baseUrl}/api/demo/v2/sessions`, { method: "POST", headers });
    const second = await fetch(`${baseUrl}/api/demo/v2/sessions`, { method: "POST", headers });
    const firstCookie = cookie(first);
    const secondCookie = cookie(second);

    assert.equal((await fetch(`${baseUrl}/api/demo/v2/session`, {
      headers: { cookie: firstCookie },
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/demo/v2/session`, {
      headers: { cookie: firstCookie },
    })).status, 429);
    assert.equal((await fetch(`${baseUrl}/api/demo/v2/session`, {
      headers: { cookie: secondCookie },
    })).status, 200);
  }, { sessionLimit: 1 });
});
