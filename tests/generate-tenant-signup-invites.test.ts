import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateTenantSignupInvites } from "../scripts/generate-tenant-signup-invites.ts";

test("invite generator writes distinct one-time codes and only HMAC digests for runtime use", async () => {
  const parent = await mkdtemp(join(tmpdir(), "company-os-invite-generator-"));
  const outputDirectory = join(parent, "generated");
  let sequence = 0;
  await generateTenantSignupInvites({
    outputDirectory,
    count: 20,
    randomBytes: (size) => createHash("sha256").update(String(sequence++)).digest().subarray(0, size),
  });
  const key = (await readFile(join(outputDirectory, "tenant-signup-invite-hmac-key"), "utf8")).trim();
  const codes = (await readFile(join(outputDirectory, "tenant-signup-invite-codes.txt"), "utf8"))
    .trim().split("\n");
  const digests = (await readFile(join(outputDirectory, "tenant-signup-invite-digests"), "utf8"))
    .trim().split("\n");
  assert.equal(codes.length, 20);
  assert.equal(new Set(codes).size, 20);
  assert.ok(codes.every((code) => /^COS-[A-HJ-NP-Z2-9]{5}(?:-[A-HJ-NP-Z2-9]{5}){3}$/.test(code)));
  assert.equal(digests.length, 20);
  assert.deepEqual(digests, codes.map((code) => `hmac-sha256:${createHmac(
    "sha256", Buffer.from(key, "base64url"),
  ).update("company-os/tenant-signup-invite/v1\0").update(code).digest("hex")}`));
  assert.ok(digests.every((value) => !value.includes("COS-")));
  assert.equal((await stat(outputDirectory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(outputDirectory, "tenant-signup-invite-codes.txt"))).mode & 0o777, 0o600);
});
