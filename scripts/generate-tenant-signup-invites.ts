import { createHmac, randomBytes as secureRandomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DOMAIN = "company-os/tenant-signup-invite/v1\0";

export async function generateTenantSignupInvites(input: {
  readonly outputDirectory: string;
  readonly count: number;
  readonly randomBytes?: (size: number) => Uint8Array;
}): Promise<void> {
  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 1_000) {
    throw new Error("TENANT_SIGNUP_INVITE_COUNT_INVALID");
  }
  const outputDirectory = resolve(input.outputDirectory);
  const randomBytes = input.randomBytes ?? secureRandomBytes;
  const key = Buffer.from(randomBytes(32));
  if (key.byteLength !== 32) throw new Error("TENANT_SIGNUP_INVITE_RANDOM_SOURCE_INVALID");
  const codes = new Set<string>();
  while (codes.size < input.count) {
    const entropy = Buffer.from(randomBytes(20));
    if (entropy.byteLength !== 20) throw new Error("TENANT_SIGNUP_INVITE_RANDOM_SOURCE_INVALID");
    const value = [...entropy].map((byte) => ALPHABET[byte & 31]).join("");
    codes.add(`COS-${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`);
  }
  const codeList = [...codes];
  const digests = codeList.map((code) => `hmac-sha256:${createHmac("sha256", key)
    .update(DOMAIN).update(code).digest("hex")}`);
  await mkdir(outputDirectory, { mode: 0o700 });
  await Promise.all([
    writeFile(resolve(outputDirectory, "tenant-signup-invite-hmac-key"),
      `${key.toString("base64url")}\n`, { flag: "wx", mode: 0o600 }),
    writeFile(resolve(outputDirectory, "tenant-signup-invite-digests"),
      `${digests.join("\n")}\n`, { flag: "wx", mode: 0o600 }),
    writeFile(resolve(outputDirectory, "tenant-signup-invite-codes.txt"),
      `${codeList.join("\n")}\n`, { flag: "wx", mode: 0o600 }),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDirectory = process.argv[2];
  const count = Number(process.argv[3] ?? "20");
  if (!outputDirectory) throw new Error("Usage: generate-tenant-signup-invites.ts OUTPUT_DIRECTORY [COUNT]");
  await generateTenantSignupInvites({ outputDirectory, count });
  process.stdout.write(`${JSON.stringify({ status: "CREATED", outputDirectory: resolve(outputDirectory), count })}\n`);
}
