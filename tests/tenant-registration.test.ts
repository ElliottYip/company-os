import assert from "node:assert/strict";
import test from "node:test";
import { ManageTenantRegistration } from "../application/manage-tenant-registration.ts";
import type {
  TenantRegistrationRecord,
  TenantRegistrationStorePort,
} from "../ports/tenant-registration-store-port.ts";

function memoryStore(): TenantRegistrationStorePort & { readonly records: Map<string, TenantRegistrationRecord> } {
  const records = new Map<string, TenantRegistrationRecord>();
  return {
    records,
    async create(record) {
      if ([...records.values()].some(({ slug }) => slug === record.slug)) return "SLUG_TAKEN";
      records.set(record.id, record);
      return "CREATED";
    },
    async findById(id) { return records.get(id) ?? null; },
    async replace(input) {
      const current = records.get(input.record.id);
      if (!current || current.revision !== input.expectedRevision) return "CONFLICT";
      records.set(input.record.id, input.record);
      return "UPDATED";
    },
  };
}

test("shared SaaS registration is normalized and starts pending one exact identity binding", async () => {
  const store = memoryStore();
  const service = new ManageTenantRegistration({
    store,
    nextId: () => "registration-one",
    now: () => "2026-09-03T04:00:00.000Z",
  });

  const record = await service.begin({
    mode: "SHARED_SAAS",
    slug: "  Coral-Labs  ",
    companyName: "  Coral Labs  ",
    requestedBy: "signup-session-one",
    identityBindingId: "identity-binding-one",
  });

  assert.deepEqual(record, {
    schemaVersion: 1,
    id: "registration-one",
    mode: "SHARED_SAAS",
    slug: "coral-labs",
    companyName: "Coral Labs",
    requestedBy: "signup-session-one",
    identityBindingId: "identity-binding-one",
    status: "PENDING_IDENTITY",
    revision: 1,
    createdAt: "2026-09-03T04:00:00.000Z",
    expiresAt: "2026-09-03T04:15:00.000Z",
  });
});

test("independent deployment registration becomes handoff-ready without an OAuth binding", async () => {
  const service = new ManageTenantRegistration({
    store: memoryStore(), nextId: () => "registration-independent",
    now: () => "2026-09-03T04:00:00.000Z",
  });
  const record = await service.begin({
    mode: "INDEPENDENT",
    slug: "northwind-cn",
    companyName: "Northwind China",
    requestedBy: "signup-session-two",
  });
  assert.equal(record.status, "HANDOFF_READY");
  assert.equal(record.identityBindingId, undefined);
});

test("registration rejects malformed input and duplicate slugs before creating ambiguous state", async () => {
  const store = memoryStore();
  let sequence = 0;
  const service = new ManageTenantRegistration({
    store, nextId: () => `registration-${++sequence}`,
    now: () => "2026-09-03T04:00:00.000Z",
  });
  await assert.rejects(service.begin({
    mode: "SHARED_SAAS", slug: "../other", companyName: "Other",
    requestedBy: "signup-session-one", identityBindingId: "identity-binding-one",
  }), /TENANT_SLUG_INVALID/);
  await assert.rejects(service.begin({
    mode: "SHARED_SAAS", slug: "other-company", companyName: "Other",
    requestedBy: "signup-session-one",
  }), /IDENTITY_BINDING_ID_REQUIRED/);
  await service.begin({
    mode: "INDEPENDENT", slug: "other-company", companyName: "Other",
    requestedBy: "signup-session-one",
  });
  await assert.rejects(service.begin({
    mode: "INDEPENDENT", slug: "OTHER-COMPANY", companyName: "Other Again",
    requestedBy: "signup-session-two",
  }), /TENANT_SLUG_TAKEN/);
  assert.equal(store.records.size, 1);
});

test("only the bound same-tenant identity can verify and complete a live shared registration once", async () => {
  const store = memoryStore();
  let now = "2026-09-03T04:00:00.000Z";
  const service = new ManageTenantRegistration({
    store, nextId: () => "registration-one", now: () => now,
  });
  const pending = await service.begin({
    mode: "SHARED_SAAS", slug: "coral-labs", companyName: "Coral Labs",
    requestedBy: "signup-session-one", identityBindingId: "identity-binding-one",
  });

  await assert.rejects(service.verifyIdentity({
    registrationId: pending.id,
    identityBindingId: "identity-binding-other",
    verifiedHumanId: "human-one",
    externalTenantDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }), /TENANT_IDENTITY_BINDING_MISMATCH/);

  const verified = await service.verifyIdentity({
    registrationId: pending.id,
    identityBindingId: "identity-binding-one",
    verifiedHumanId: "human-one",
    externalTenantDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  assert.equal(verified.status, "IDENTITY_VERIFIED");
  assert.equal(verified.revision, 2);

  const completed = await service.complete({
    registrationId: pending.id,
    verifiedHumanId: "human-one",
    companyId: "company-coral",
  });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.revision, 3);
  await assert.rejects(service.complete({
    registrationId: pending.id,
    verifiedHumanId: "human-one",
    companyId: "company-other",
  }), /TENANT_REGISTRATION_ALREADY_COMPLETED/);

  now = "2026-09-03T05:00:00.000Z";
  await assert.rejects(service.verifyIdentity({
    registrationId: pending.id,
    identityBindingId: "identity-binding-one",
    verifiedHumanId: "human-one",
    externalTenantDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }), /TENANT_REGISTRATION_ALREADY_COMPLETED/);
});

test("expired registrations and optimistic-write conflicts fail closed", async () => {
  const store = memoryStore();
  let now = "2026-09-03T04:00:00.000Z";
  const service = new ManageTenantRegistration({
    store, nextId: () => "registration-one", now: () => now,
  });
  const pending = await service.begin({
    mode: "SHARED_SAAS", slug: "coral-labs", companyName: "Coral Labs",
    requestedBy: "signup-session-one", identityBindingId: "identity-binding-one",
  });
  now = "2026-09-03T04:15:00.000Z";
  await assert.rejects(service.verifyIdentity({
    registrationId: pending.id,
    identityBindingId: "identity-binding-one",
    verifiedHumanId: "human-one",
    externalTenantDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }), /TENANT_REGISTRATION_EXPIRED/);

  const conflictStore = memoryStore();
  const originalReplace = conflictStore.replace;
  conflictStore.replace = async (input) => {
    await originalReplace(input);
    return "CONFLICT";
  };
  const conflicted = new ManageTenantRegistration({
    store: conflictStore, nextId: () => "registration-two",
    now: () => "2026-09-03T04:00:00.000Z",
  });
  await conflicted.begin({
    mode: "SHARED_SAAS", slug: "northwind-cn", companyName: "Northwind",
    requestedBy: "signup-session-two", identityBindingId: "identity-binding-two",
  });
  await assert.rejects(conflicted.verifyIdentity({
    registrationId: "registration-two",
    identityBindingId: "identity-binding-two",
    verifiedHumanId: "human-two",
    externalTenantDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }), /TENANT_REGISTRATION_CONFLICT/);
});
