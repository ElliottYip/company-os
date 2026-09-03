CREATE TABLE "company_os_tenant_signup_invite_redemption" (
  "invite_digest" text PRIMARY KEY,
  "registration_id" text NOT NULL REFERENCES "company_os_tenant_registration"("id") ON DELETE RESTRICT,
  "redeemed_at" timestamptz NOT NULL,
  CONSTRAINT "company_os_tenant_signup_invite_digest_ck"
    CHECK ("invite_digest" ~ '^hmac-sha256:[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_tenant_signup_invite_registration_uq"
  ON "company_os_tenant_signup_invite_redemption" ("registration_id");
