import assert from "node:assert/strict";
import test from "node:test";
import { decideCompanyAccess, type CompanyMembership } from "../core/company-access.ts";

function membership(overrides: Partial<CompanyMembership> = {}): CompanyMembership {
  return {
    companyId: "company-one",
    principalType: "user",
    principalId: "human-one",
    role: "operator",
    status: "active",
    ...overrides,
  };
}

test("Paperclip-aligned active memberships scope every company read and write", () => {
  const active = membership();
  assert.equal(decideCompanyAccess({
    type: "user", principalId: "human-one", memberships: [active],
  }, "company-one", "write").allowed, true);
  assert.deepEqual(decideCompanyAccess({
    type: "user", principalId: "human-one", memberships: [membership({ status: "suspended" })],
  }, "company-one", "read"), { allowed: false, code: "COMPANY_MEMBERSHIP_INACTIVE" });
  assert.deepEqual(decideCompanyAccess({
    type: "user", principalId: "instance-admin", memberships: [],
  }, "company-one", "read"), { allowed: false, code: "COMPANY_ACCESS_NOT_FOUND" });
});

test("Paperclip-aligned viewer membership is read-only", () => {
  const viewer = membership({ role: "viewer" });
  assert.equal(decideCompanyAccess({
    type: "user", principalId: "human-one", memberships: [viewer],
  }, "company-one", "read").allowed, true);
  assert.deepEqual(decideCompanyAccess({
    type: "user", principalId: "human-one", memberships: [viewer],
  }, "company-one", "write"), { allowed: false, code: "COMPANY_VIEWER_READ_ONLY" });
});

test("Agent access intersects its own membership with its responsible human", () => {
  const agentMembership = membership({ principalType: "agent", principalId: "agent-one", role: "member" });
  const actor = {
    type: "agent" as const,
    principalId: "agent-one",
    companyId: "company-one",
    memberships: [agentMembership],
    responsibleUserId: "human-one",
    responsibleUserMemberships: [membership({ role: "viewer" })],
  };
  assert.equal(decideCompanyAccess(actor, "company-one", "read").allowed, true);
  assert.deepEqual(decideCompanyAccess(actor, "company-one", "write"), {
    allowed: false,
    code: "RESPONSIBLE_USER_UNAUTHORIZED",
  });
  assert.deepEqual(decideCompanyAccess({ ...actor, responsibleUserMemberships: [] }, "company-one", "read"), {
    allowed: false,
    code: "RESPONSIBLE_USER_UNAVAILABLE",
  });
  assert.deepEqual(decideCompanyAccess(actor, "company-two", "read"), {
    allowed: false,
    code: "COMPANY_ACCESS_NOT_FOUND",
  });
});
