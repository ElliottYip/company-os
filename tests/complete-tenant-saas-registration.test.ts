import assert from "node:assert/strict";
import test from "node:test";

import { CompleteTenantSaasRegistration } from
  "../application/complete-tenant-saas-registration.ts";
import { OWNER_DEFAULT_PERMISSION_KEYS } from "../core/company-access.ts";
import type { TenantSaasCompletionStorePort } from
  "../ports/tenant-saas-completion-store-port.ts";

test("SaaS completion delegates one bounded atomic command without instance-admin authority", async () => {
  const commands: Parameters<TenantSaasCompletionStorePort["complete"]>[0][] = [];
  let sequence = 0;
  const service = new CompleteTenantSaasRegistration({
    store: {
      async findRegistrationIdBySlug() { return "registration-one"; },
      async complete(command) {
        commands.push(command);
        return {
          status: "COMPLETED",
          registrationId: command.registrationId,
          companyId: command.companyId,
          ownerUserId: command.verifiedUserId,
          slug: "alpha-company",
        };
      },
    },
    nextId: () => `record-${++sequence}`,
    now: () => "2026-09-03T07:00:00.000Z",
  });

  const result = await service.complete({ registrationId: "registration-one", verifiedUserId: "user-one" });
  assert.equal(result.status, "COMPLETED");
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.registrationId, "registration-one");
  assert.equal(commands[0]?.verifiedUserId, "user-one");
  assert.deepEqual(commands[0]?.permissionGrants.map(({ permissionKey }) => permissionKey),
    OWNER_DEFAULT_PERMISSION_KEYS);
  assert.doesNotMatch(JSON.stringify(commands[0]), /instance.?admin/i);
});

test("SaaS completion rejects malformed identity, locale, IDs, and clocks before persistence", async () => {
  let calls = 0;
  const store: TenantSaasCompletionStorePort = {
    async findRegistrationIdBySlug() { return null; },
    async complete() { calls += 1; throw new Error("UNREACHABLE"); },
  };
  const invalidIdentity = new CompleteTenantSaasRegistration({
    store, nextId: () => "record-one", now: () => "2026-09-03T07:00:00.000Z",
  });
  await assert.rejects(invalidIdentity.complete({
    registrationId: "registration-one", verifiedUserId: "../user",
  }), /VERIFIED_HUMAN_ID_INVALID/);
  await assert.rejects(invalidIdentity.complete({
    registrationId: "registration-one", verifiedUserId: "user-one", locale: "bad_locale",
  }), /COMPANY_LOCALE_INVALID/);
  const badClock = new CompleteTenantSaasRegistration({
    store, nextId: () => "record-one", now: () => "tomorrow",
  });
  await assert.rejects(badClock.complete({
    registrationId: "registration-one", verifiedUserId: "user-one",
  }), /TENANT_COMPLETION_CLOCK_INVALID/);
  assert.equal(calls, 0);
});

test("SaaS completion resolves a bounded slug server-side before creating the owner", async () => {
  const commands: Parameters<TenantSaasCompletionStorePort["complete"]>[0][] = [];
  const service = new CompleteTenantSaasRegistration({
    store: {
      async findRegistrationIdBySlug(slug) {
        assert.equal(slug, "alpha-company");
        return "registration-one";
      },
      async complete(command) {
        commands.push(command);
        return { status: "COMPLETED", registrationId: command.registrationId,
          companyId: command.companyId, ownerUserId: command.verifiedUserId, slug: "alpha-company" };
      },
    },
    nextId: (() => { let value = 0; return () => `record-${++value}`; })(),
    now: () => "2026-09-03T07:00:00.000Z",
  });
  const result = await service.completeBySlug({ slug: "alpha-company", verifiedUserId: "user-one" });
  assert.equal(result.companyId, "record-1");
  assert.equal(commands[0]?.registrationId, "registration-one");
  await assert.rejects(service.completeBySlug({ slug: "../alpha", verifiedUserId: "user-one" }),
    /TENANT_SLUG_INVALID/);
});
