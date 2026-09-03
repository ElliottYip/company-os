import { createHmac } from "node:crypto";

const INVITE_CODE = /^COS-[A-HJ-NP-Z2-9]{5}(?:-[A-HJ-NP-Z2-9]{5}){3}$/;
const INVITE_DIGEST = /^hmac-sha256:[a-f0-9]{64}$/;
const DOMAIN = "company-os/tenant-signup-invite/v1\0";

export function createTenantSignupInviteGate(input: {
  readonly key: Uint8Array;
  readonly allowedDigests: ReadonlySet<string>;
}) {
  if (input.key.byteLength < 32) throw new Error("TENANT_SIGNUP_INVITE_KEY_INVALID");
  if (input.allowedDigests.size < 1 ||
      [...input.allowedDigests].some((value) => !INVITE_DIGEST.test(value))) {
    throw new Error("TENANT_SIGNUP_INVITE_DIGEST_INVALID");
  }
  const allowedDigests = new Set(input.allowedDigests);
  return Object.freeze({
    verify(rawCode: string): `hmac-sha256:${string}` {
      const code = rawCode.trim().toUpperCase();
      if (!INVITE_CODE.test(code)) throw new Error("TENANT_SIGNUP_NOT_ALLOWED");
      const candidate = `hmac-sha256:${createHmac("sha256", input.key)
        .update(DOMAIN).update(code).digest("hex")}` as const;
      if (!allowedDigests.has(candidate)) throw new Error("TENANT_SIGNUP_NOT_ALLOWED");
      return candidate;
    },
  });
}
