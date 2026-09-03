import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createFeishuIdentityBindingVerifier } from
  "../adapters/identity/feishu-identity-binding-verifier.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

const credentials = {
  clientId: "cli_company_fixture",
  clientSecret: fixtureMaterial("feishu-binding"),
};

test("Feishu binding verification proves credentials and returns only bounded tenant metadata", async () => {
  const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
  const verifier = createFeishuIdentityBindingVerifier(async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return Response.json({
        code: 0,
        msg: "ok",
        tenant_access_token: "tenant-token-must-not-escape",
        expire: 7200,
      });
    }
    if (url.endsWith("/open-apis/tenant/v2/tenant/query")) {
      return Response.json({
        code: 0,
        msg: "ok",
        data: { tenant: {
          name: "Coral Labs",
          tenant_key: "tenant-key-must-be-digested",
          display_id: "F123456",
          domain: "coral.feishu.cn",
        } },
      });
    }
    throw new Error("unexpected request");
  });

  const result = await verifier.verify(credentials);
  assert.deepEqual(result, {
    providerFamily: "OAUTH2",
    providerKey: "feishu",
    clientId: credentials.clientId,
    externalTenantDigest: `sha256:${createHash("sha256").update("tenant-key-must-be-digested").digest("hex")}`,
    tenantDisplayName: "Coral Labs",
  });
  assert.equal(requests[0]?.url, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    app_id: credentials.clientId,
    app_secret: credentials.clientSecret,
  });
  assert.equal(requests[1]?.url, "https://open.feishu.cn/open-apis/tenant/v2/tenant/query");
  assert.equal(new Headers(requests[1]?.init?.headers).get("authorization"),
    "Bearer tenant-token-must-not-escape");
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|tenant-token|tenant-key-must/);
});

test("Feishu binding verification rejects invalid local input before network access", async () => {
  let requested = false;
  const verifier = createFeishuIdentityBindingVerifier(async () => {
    requested = true;
    throw new Error("must not run");
  });
  await assert.rejects(verifier.verify({ ...credentials, clientId: "../bad" }),
    /IDENTITY_BINDING_CREDENTIALS_INVALID/);
  await assert.rejects(verifier.verify({ ...credentials, clientSecret: "short" }),
    /IDENTITY_BINDING_CREDENTIALS_INVALID/);
  assert.equal(requested, false);
});

test("Feishu binding verification fails closed for token and tenant response errors", async () => {
  const denied = createFeishuIdentityBindingVerifier(async () => Response.json({
    code: 10003, msg: "invalid app secret",
  }));
  await assert.rejects(denied.verify(credentials), /IDENTITY_BINDING_VERIFICATION_FAILED/);

  let request = 0;
  const malformedTenant = createFeishuIdentityBindingVerifier(async () => {
    request += 1;
    return request === 1
      ? Response.json({ code: 0, tenant_access_token: "bounded-token", expire: 7200 })
      : Response.json({ code: 0, data: { tenant: { name: "Missing stable tenant key" } } });
  });
  await assert.rejects(malformedTenant.verify(credentials), /IDENTITY_BINDING_VERIFICATION_FAILED/);

  const oversized = createFeishuIdentityBindingVerifier(async () => new Response("x".repeat(65 * 1024), {
    status: 200,
    headers: { "content-length": String(65 * 1024) },
  }));
  await assert.rejects(oversized.verify(credentials), /IDENTITY_BINDING_VERIFICATION_FAILED/);
});

test("Feishu binding verification converts transport failures into one non-secret error", async () => {
  const verifier = createFeishuIdentityBindingVerifier(async () => {
    throw new Error(`network failed with ${credentials.clientSecret}`);
  });
  await assert.rejects(verifier.verify(credentials), (error: unknown) => {
    assert.equal(error instanceof Error ? error.message : "", "IDENTITY_BINDING_VERIFICATION_FAILED");
    return true;
  });
});
