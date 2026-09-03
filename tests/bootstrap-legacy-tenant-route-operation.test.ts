import assert from "node:assert/strict";
import test from "node:test";

import { runLegacyTenantBootstrapOperation, withDecodedTenantMasterKey } from
  "../scripts/bootstrap-legacy-tenant-route.ts";

function fixtureMaterial(label: string): string {
  return `${label}-fixture-material-`.padEnd(32, "x");
}

const input = {
  companyId: "company-leike",
  ownerUserId: "owner-leike",
  slug: "leike",
  appId: "cli_leike",
  appSecret: fixtureMaterial("legacy-feishu"),
};

test("legacy bootstrap verify-only runs the full read-only preflight and emits no credentials", async () => {
  let writes = 0;
  const result = await runLegacyTenantBootstrapOperation({
    mode: "verify-only",
    input,
    preflight: async (received) => {
      assert.deepEqual(received, input);
      return { status: "READY", companyId: input.companyId, slug: input.slug };
    },
    bootstrap: async () => { writes += 1; return { status: "CREATED" as const,
      companyId: input.companyId, slug: input.slug }; },
  });

  assert.equal(writes, 0);
  assert.deepEqual(result, {
    schemaVersion: 1, status: "READY", mode: "verify-only", companyId: input.companyId,
    slug: input.slug, provider: "FEISHU", secretMaterialIncluded: false,
  });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(input.appId));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(input.appSecret));
});

test("legacy bootstrap apply delegates once and returns a secret-free idempotent receipt", async () => {
  let writes = 0;
  const result = await runLegacyTenantBootstrapOperation({
    mode: "apply",
    input,
    preflight: async () => { throw new Error("MUST_NOT_PREFLIGHT_TWICE"); },
    bootstrap: async (received) => {
      writes += 1;
      assert.deepEqual(received, input);
      return { status: "ALREADY_PRESENT", companyId: input.companyId, slug: input.slug };
    },
  });

  assert.equal(writes, 1);
  assert.deepEqual(result, {
    schemaVersion: 1, status: "ALREADY_PRESENT", mode: "apply", companyId: input.companyId,
    slug: input.slug, provider: "FEISHU", secretMaterialIncluded: false,
  });
});

test("decoded tenant master key is cleared even when the operation fails", async () => {
  let observed: Buffer | null = null;
  await assert.rejects(withDecodedTenantMasterKey({
    version: "key-one",
    encoded: Buffer.alloc(32, 9).toString("base64url"),
  }, async (material) => {
    observed = material.key;
    throw new Error("EXPECTED_OPERATION_FAILURE");
  }), /EXPECTED_OPERATION_FAILURE/);
  assert.deepEqual(observed, Buffer.alloc(32));
});
