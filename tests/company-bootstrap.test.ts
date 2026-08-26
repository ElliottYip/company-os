import assert from "node:assert/strict";
import test from "node:test";
import { CompanyBootstrapService } from "../application/company-bootstrap.ts";
import type { CompanyAccessStorePort } from "../ports/company-access-store-port.ts";

function fixtureStore(calls: unknown[]): CompanyAccessStorePort {
  return {
    async listCompanyIds() { return []; },
    async claimFirstInstanceAdmin(input) {
      calls.push({ operation: "claim", input });
      return { status: "CLAIMED", userId: input.userId };
    },
    async createOwnedCompany(input) {
      calls.push({ operation: "create", input });
      return { ...input, permissionGrantIds: input.permissionGrants.map(({ id }) => id) };
    },
    async listActiveHumanMemberships() { return []; },
    async listPermissionKeys() { return []; },
  };
}

test("first admin claim is explicit and company creation remains a separate atomic store command", async () => {
  const calls: unknown[] = [];
  let sequence = 0;
  const service = new CompanyBootstrapService({
    store: fixtureStore(calls),
    nextId: () => `id-${++sequence}`,
  });
  const actor = { userId: "human-one", sessionId: "session-one" };
  assert.deepEqual(await service.claimFirstInstanceAdmin(actor), {
    status: "CLAIMED", userId: "human-one",
  });
  const company = await service.createOwnedCompany(actor, {
    name: " Coral Labs ", purpose: " Keep humans accountable. ", locale: "en-US",
  });
  assert.equal(company.name, "Coral Labs");
  assert.equal(company.purpose, "Keep humans accountable.");
  assert.equal(company.permissionGrantIds.length, 8);
  assert.deepEqual(
    (calls[1] as { input: { permissionGrants: { permissionKey: string }[] } }).input.permissionGrants
      .map(({ permissionKey }) => permissionKey),
    ["agents:create", "agents:configure", "skills:create", "environments:manage", "users:invite",
      "users:manage_permissions", "tasks:assign", "joins:approve"],
  );
  assert.deepEqual(calls.map((call) => (call as { operation: string }).operation), ["claim", "create"]);
});

test("company bootstrap rejects invalid identity and company input before persistence", async () => {
  const calls: unknown[] = [];
  const service = new CompanyBootstrapService({
    store: fixtureStore(calls), nextId: () => "valid-id",
  });
  await assert.rejects(service.claimFirstInstanceAdmin({
    userId: "../../user", sessionId: "session-one",
  }), /AUTHENTICATED_USER_ID_INVALID/);
  await assert.rejects(service.createOwnedCompany({
    userId: "human-one", sessionId: "session-one",
  }, { name: "", purpose: "Purpose", locale: "en-US" }), /COMPANY_NAME_INVALID/);
  await assert.rejects(service.createOwnedCompany({
    userId: "human-one", sessionId: "session-one",
  }, { name: "Company", purpose: "Purpose", locale: "english" }), /COMPANY_LOCALE_INVALID/);
  assert.deepEqual(calls, []);
});
