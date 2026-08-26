import assert from "node:assert/strict";
import test from "node:test";
import { ManagedInstanceAdminProvisioningService } from "../application/provision-managed-instance-admin.ts";
import type { CompanyAccessStorePort } from "../ports/company-access-store-port.ts";

function accessStore(): CompanyAccessStorePort {
  return {
    async listCompanyIds() { return []; },
    async claimFirstInstanceAdmin(input) { return { status: "CLAIMED", userId: input.userId }; },
    async createOwnedCompany() { throw new Error("UNUSED"); },
    async listActiveHumanMemberships() { return []; },
    async listCompanyHumanMembers() { return []; },
    async updateCompanyHumanMembership() { throw new Error("UNUSED"); },
    async isInstanceAdmin() { return false; },
    async listPermissionKeys() { return []; },
  };
}

test("managed provisioning grants the first admin only to an exact verified OIDC human", async () => {
  const service = new ManagedInstanceAdminProvisioningService({
    humans: {
      async findVerifiedHumanIdByEmail(email) {
        assert.equal(email, "owner@example.test");
        return "human-one";
      },
    },
    access: accessStore(),
    nextId: () => "instance-role-one",
  });
  assert.deepEqual(await service.provision("  OWNER@example.test "), {
    schemaVersion: 1, status: "PROVISIONED",
  });
});

test("managed provisioning fails closed for an unknown identity and an existing different admin", async () => {
  const missing = new ManagedInstanceAdminProvisioningService({
    humans: { async findVerifiedHumanIdByEmail() { return null; } },
    access: accessStore(), nextId: () => "instance-role-one",
  });
  await assert.rejects(missing.provision("owner@example.test"), /VERIFIED_HUMAN_NOT_FOUND/);

  const existing = new ManagedInstanceAdminProvisioningService({
    humans: { async findVerifiedHumanIdByEmail() { return "human-two"; } },
    access: { ...accessStore(), async claimFirstInstanceAdmin() {
      return { status: "ALREADY_CLAIMED", existingUserId: "human-one" };
    } },
    nextId: () => "instance-role-two",
  });
  await assert.rejects(existing.provision("owner@example.test"), /INSTANCE_ADMIN_ALREADY_PROVISIONED/);
});

test("managed provisioning rejects malformed email before identity lookup", async () => {
  let lookedUp = false;
  const service = new ManagedInstanceAdminProvisioningService({
    humans: { async findVerifiedHumanIdByEmail() { lookedUp = true; return "human-one"; } },
    access: accessStore(), nextId: () => "instance-role-one",
  });
  await assert.rejects(service.provision("not-an-email"), /PROVISIONING_EMAIL_INVALID/);
  assert.equal(lookedUp, false);
});
