import { createHmac } from "node:crypto";

const TENANT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function tenantAssertedEmailHmac(input: {
  readonly key: Buffer;
  readonly tenantDigest: string;
  readonly email: string;
}): string {
  if (input.key.length !== 32 || !TENANT_DIGEST.test(input.tenantDigest)) {
    throw new Error("TENANT_EMAIL_HMAC_CONTEXT_INVALID");
  }
  const email = input.email.trim().toLocaleLowerCase("en-US");
  if (!EMAIL.test(email) || email.length > 254) throw new Error("TENANT_EMAIL_HMAC_EMAIL_INVALID");
  const digest = createHmac("sha256", input.key)
    .update(input.tenantDigest).update("\0").update(email).digest("hex");
  return `hmac-sha256:${digest}`;
}
