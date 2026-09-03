import assert from "node:assert/strict";
import test from "node:test";

import { createFeishuDirectorySource } from "../adapters/identity/feishu-directory-source.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

const configuration = {
  appId: "cli_company_os_fixture",
  appSecret: fixtureMaterial("feishu-app"),
  tenantKey: "tenant-company-fixture",
};

test("Feishu directory reads departments and direct members with app identity", async () => {
  const requests: Array<{ readonly url: string; readonly init?: RequestInit }> = [];
  const source = createFeishuDirectorySource(configuration, async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return Response.json({ code: 0, msg: "ok", tenant_access_token: "tenant-token-fixture", expire: 7200 });
    }
    if (url.includes("/departments/0/children")) {
      return Response.json({ code: 0, msg: "ok", data: { has_more: false, items: [{
        name: "研发部", open_department_id: "od_engineering", parent_department_id: "0",
        status: { is_deleted: false },
      }] } });
    }
    if (url.includes("department_id=0")) {
      return Response.json({ code: 0, msg: "ok", data: { has_more: false, items: [] } });
    }
    if (url.includes("department_id=od_engineering")) {
      return Response.json({ code: 0, msg: "ok", data: { has_more: false, items: [{
        union_id: "on_alice", name: "Alice", enterprise_email: "ALICE@company.example",
        department_ids: ["od_engineering"], status: { is_activated: true, is_resigned: false },
        mobile: "+8613800000000", employee_no: "secret-number",
      }] } });
    }
    throw new Error(`unexpected fixture request: ${url}`);
  }, () => new Date("2026-09-01T01:02:03.000Z"));

  const snapshot = await source.readSnapshot();

  assert.deepEqual(snapshot, {
    sourceTenantId: "tenant-company-fixture",
    capturedAt: new Date("2026-09-01T01:02:03.000Z"),
    departments: [{ externalId: "od_engineering", parentExternalId: null, name: "研发部", active: true }],
    humans: [{
      externalId: "on_alice", displayName: "Alice", enterpriseEmail: "alice@company.example",
      departmentExternalIds: ["od_engineering"], active: true,
    }],
  });
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    app_id: configuration.appId,
    app_secret: configuration.appSecret,
  });
  assert.ok(requests.slice(1).every((request) =>
    new Headers(request.init?.headers).get("authorization") === "Bearer tenant-token-fixture"));
  assert.doesNotMatch(JSON.stringify(snapshot), /mobile|employee_no|tenant-token/);
});

test("Feishu directory follows bounded pagination and deduplicates multi-department users", async () => {
  let departmentPage = 0;
  let memberCalls = 0;
  const source = createFeishuDirectorySource(configuration, async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("tenant_access_token/internal")) {
      return Response.json({ code: 0, tenant_access_token: "tenant-token-fixture", expire: 7200 });
    }
    if (url.pathname.includes("/departments/0/children")) {
      departmentPage += 1;
      return Response.json({ code: 0, data: departmentPage === 1
        ? { has_more: true, page_token: "next-departments", items: [{ name: "A", open_department_id: "od_a", parent_department_id: "0" }] }
        : { has_more: false, items: [{ name: "B", open_department_id: "od_b", parent_department_id: "0" }] } });
    }
    memberCalls += 1;
    const department = url.searchParams.get("department_id") ?? "";
    return Response.json({ code: 0, data: { has_more: false, items: department === "0" ? [] : [{
      union_id: "on_same", name: "Same Human", enterprise_email: "same@company.example",
      department_ids: ["od_a", "od_b"], status: { is_activated: true },
    }] } });
  });

  const snapshot = await source.readSnapshot();
  assert.equal(departmentPage, 2);
  assert.equal(memberCalls, 3);
  assert.equal(snapshot.humans.length, 1);
  assert.deepEqual(snapshot.humans[0]?.departmentExternalIds, ["od_a", "od_b"]);
});

test("Feishu directory accepts the documented root department identifier on a user", async () => {
  const source = createFeishuDirectorySource(configuration, async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("tenant_access_token/internal")) {
      return Response.json({ code: 0, tenant_access_token: "tenant-token-fixture", expire: 7200 });
    }
    if (url.pathname.includes("/departments/0/children")) {
      return Response.json({ code: 0, data: { has_more: false, items: [] } });
    }
    return Response.json({ code: 0, data: { has_more: false, items: [{
      union_id: "on_root_member", name: "Root Member", email: "root@company.example",
      department_ids: ["0"],
    }] } });
  });

  const snapshot = await source.readSnapshot();
  assert.deepEqual(snapshot.humans.map(({ externalId, departmentExternalIds }) =>
    ({ externalId, departmentExternalIds })), [{
    externalId: "on_root_member", departmentExternalIds: ["0"],
  }]);
});

test("Feishu directory accepts an omitted items field only for an empty terminal page", async () => {
  const empty = createFeishuDirectorySource(configuration, async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("tenant_access_token/internal")) {
      return Response.json({ code: 0, tenant_access_token: "tenant-token-fixture", expire: 7200 });
    }
    return Response.json({ code: 0, data: { has_more: false } });
  });
  const snapshot = await empty.readSnapshot();
  assert.equal(snapshot.sourceTenantId, configuration.tenantKey);
  assert.ok(snapshot.capturedAt instanceof Date);
  assert.deepEqual(snapshot.departments, []);
  assert.deepEqual(snapshot.humans, []);

  const truncated = createFeishuDirectorySource(configuration, async (input) => {
    if (String(input).endsWith("tenant_access_token/internal")) {
      return Response.json({ code: 0, tenant_access_token: "tenant-token-fixture", expire: 7200 });
    }
    return Response.json({ code: 0, data: { has_more: true, page_token: "next" } });
  });
  await assert.rejects(truncated.readSnapshot(), /FEISHU_DIRECTORY_RESPONSE_INVALID/);
});

test("Feishu directory fails closed on malformed, oversized, or endless remote data", async () => {
  const malformed = createFeishuDirectorySource(configuration, async (input) => {
    if (String(input).endsWith("tenant_access_token/internal")) {
      return Response.json({ code: 0, tenant_access_token: "tenant-token-fixture", expire: 7200 });
    }
    return Response.json({ code: 0, data: { has_more: false, items: [{ name: "missing stable id" }] } });
  });
  await assert.rejects(malformed.readSnapshot(), /FEISHU_DIRECTORY_RESPONSE_INVALID/);

  const oversized = createFeishuDirectorySource(configuration, async () => new Response("x".repeat(65 * 1024), {
    status: 200, headers: { "content-length": String(65 * 1024) },
  }));
  await assert.rejects(oversized.readSnapshot(), /FEISHU_DIRECTORY_TOKEN_FAILED/);

  assert.throws(() => createFeishuDirectorySource({ ...configuration, tenantKey: "" }),
    /FEISHU_TENANT_KEY_REQUIRED/);
});
