import assert from "node:assert/strict";
import test from "node:test";
import { SessionCompanyIdentityAdapter } from "../adapters/identity/session-company-identity-adapter.ts";

function adapter(role: "owner" | "operator" | "viewer", options?: {
  readonly permissionKeys?: readonly string[];
  readonly isInstanceAdmin?: boolean;
}) {
  return new SessionCompanyIdentityAdapter({
    user: { id: "human-one", displayName: "Human One" }, companyId: "company-one",
    memberships: [{ companyId: "company-one", principalType: "user", principalId: "human-one", status: "active", role }],
    ...options,
    now: () => "2026-08-24T10:00:00.000Z", nextId: () => "receipt-one",
});
}

test("request session identity authorizes through active company membership", async () => {
  const identity = adapter("owner");
  assert.equal((await identity.getCurrentIdentity())?.organizationId, "company-one");
  assert.deepEqual(await identity.authorize({
    companyId: "company-one", action: "organization:register", reason: "Setup",
  }), { id: "receipt-one", principalId: "human-one", authorizedAt: "2026-08-24T10:00:00.000Z" });
});

test("Paperclip-aligned instance admin elevation bypasses company permission grants", async () => {
  const identity = adapter("owner", { permissionKeys: [], isInstanceAdmin: true });
  assert.equal((await identity.authorize({
    companyId: "company-one", action: "connector-catalog:replace", reason: "Configure tools",
  })).principalId, "human-one");
});

test("company members need explicit grants for privileged actions", async () => {
  const operator = adapter("operator", { permissionKeys: ["tasks:assign"] });
  assert.equal((await operator.authorize({
    companyId: "company-one", action: "work:dispatch", reason: "Assign work",
  })).principalId, "human-one");
  await assert.rejects(operator.authorize({
    companyId: "company-one", action: "connector-catalog:replace", reason: "Configure tools",
  }), /COMPANY_PERMISSION_REQUIRED/);
});

test("viewer session stays read-only and cross-tenant requests fail closed", async () => {
  const identity = adapter("viewer");
  assert.equal((await identity.authorize({
    companyId: "company-one", action: "agent-boss:read", reason: "Read",
  })).principalId, "human-one");
  await assert.rejects(identity.authorize({
    companyId: "company-one", action: "work:dispatch", reason: "Write",
  }), /COMPANY_VIEWER_READ_ONLY/);
  await assert.rejects(identity.authorize({
    companyId: "company-two", action: "agent-boss:read", reason: "Read",
  }), /TENANT_MISMATCH/);
});
