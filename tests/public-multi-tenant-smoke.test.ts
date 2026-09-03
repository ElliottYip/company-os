import assert from "node:assert/strict";
import test from "node:test";

import { runPublicMultiTenantSmoke } from "../scripts/smoke-multi-tenant-public.ts";

test("public multi-tenant smoke proves the no-account boundary without a valid invite or tenant", async () => {
  const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    requests.push({ url, ...(init ? { init } : {}) });
    const pathname = new URL(url).pathname;
    if (pathname === "/start") {
      return new Response("<!doctype html><title>Company OS</title>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "x-company-os-release-id": "release-test" },
      });
    }
    if (pathname === "/api/v1/tenant-registrations") {
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init.headers).get("origin"), "https://company.test");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.inviteCode, "COS-AAAAA-AAAAA-AAAAA-AAAAA");
      assert.equal(body.slug, "smoke-a1b2c3d4e5f6");
      return Response.json({ error: { code: "TENANT_SIGNUP_NOT_ALLOWED" } }, { status: 403 });
    }
    if (pathname === "/t/smoke-a1b2c3d4e5f6/sign-in" ||
        pathname === "/api/auth/oauth2/callback/feishu-smoke-a1b2c3d4e5f6") {
      return Response.json({ error: { code: "TENANT_AUTH_ROUTE_NOT_FOUND" } }, { status: 404 });
    }
    return new Response(null, { status: 500 });
  };

  const result = await runPublicMultiTenantSmoke({
    webBaseUrl: "https://company.test",
    apiBaseUrl: "https://api.company.test",
    probeSuffix: "a1b2c3d4e5f6",
    fetcher,
  });

  assert.deepEqual(result, {
    ok: true,
    releaseId: "release-test",
    startStatus: 200,
    invalidInviteStatus: 403,
    missingTenantStatus: 404,
    missingCallbackStatus: 404,
    probeSlug: "smoke-a1b2c3d4e5f6",
  });
  assert.equal(requests.length, 4);
  assert.doesNotMatch(JSON.stringify(requests), /company_os_invite_|cli_[a-z0-9]{16,}/);
});

test("public multi-tenant smoke fails closed when a missing tenant unexpectedly resolves", async () => {
  const fetcher = async (input: string | URL | Request): Promise<Response> => {
    const pathname = new URL(String(input)).pathname;
    if (pathname === "/start") {
      return new Response("ok", { status: 200, headers: {
        "content-type": "text/html", "x-company-os-release-id": "release-test",
      } });
    }
    if (pathname === "/api/v1/tenant-registrations") {
      return Response.json({ error: { code: "TENANT_SIGNUP_NOT_ALLOWED" } }, { status: 403 });
    }
    return Response.json({ url: "https://identity.example.test/authorize" }, { status: 200 });
  };

  await assert.rejects(runPublicMultiTenantSmoke({
    webBaseUrl: "https://company.test",
    apiBaseUrl: "https://api.company.test",
    probeSuffix: "a1b2c3d4e5f6",
    fetcher,
  }), /PUBLIC_SMOKE_UNKNOWN_TENANT_DID_NOT_FAIL_CLOSED/);
});
