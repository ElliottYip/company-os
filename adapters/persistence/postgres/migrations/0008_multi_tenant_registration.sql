ALTER TABLE "company_os_auth_user" ADD COLUMN "asserted_email_hmac" text;
--> statement-breakpoint
ALTER TABLE "company_os_auth_user" ADD CONSTRAINT "company_os_auth_user_asserted_email_hmac_ck"
  CHECK ("asserted_email_hmac" IS NULL OR "asserted_email_hmac" ~ '^hmac-sha256:[a-f0-9]{64}$');
--> statement-breakpoint
ALTER TABLE "company_os_human_invite" ADD COLUMN "expected_email_hmac" text;
--> statement-breakpoint
ALTER TABLE "company_os_human_invite" ADD CONSTRAINT "company_os_human_invite_email_hmac_ck"
  CHECK ("expected_email_hmac" IS NULL OR "expected_email_hmac" ~ '^hmac-sha256:[a-f0-9]{64}$');
--> statement-breakpoint
CREATE TABLE "company_os_tenant_registration" (
  "id" text PRIMARY KEY,
  "mode" text NOT NULL,
  "slug" text NOT NULL,
  "company_name" text NOT NULL,
  "requested_by" text NOT NULL,
  "identity_binding_id" text,
  "status" text NOT NULL,
  "revision" integer NOT NULL,
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "verified_human_id" text REFERENCES "company_os_auth_user"("id") ON DELETE RESTRICT,
  "external_tenant_digest" text,
  "completed_at" timestamptz,
  "company_id" text REFERENCES "company_os_company"("id") ON DELETE RESTRICT,
  CONSTRAINT "company_os_tenant_registration_mode_ck"
    CHECK ("mode" IN ('SHARED_SAAS', 'INDEPENDENT')),
  CONSTRAINT "company_os_tenant_registration_slug_ck"
    CHECK (char_length("slug") BETWEEN 3 AND 48 AND "slug" ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  CONSTRAINT "company_os_tenant_registration_name_ck"
    CHECK (char_length("company_name") BETWEEN 1 AND 160),
  CONSTRAINT "company_os_tenant_registration_revision_ck" CHECK ("revision" > 0),
  CONSTRAINT "company_os_tenant_registration_expiry_ck" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "company_os_tenant_registration_digest_ck" CHECK (
    "external_tenant_digest" IS NULL OR "external_tenant_digest" ~ '^sha256:[a-f0-9]{64}$'
  ),
  CONSTRAINT "company_os_tenant_registration_state_ck" CHECK (
    ("mode" = 'INDEPENDENT' AND "status" = 'HANDOFF_READY'
      AND "identity_binding_id" IS NULL AND "verified_at" IS NULL
      AND "verified_human_id" IS NULL AND "external_tenant_digest" IS NULL
      AND "completed_at" IS NULL AND "company_id" IS NULL)
    OR
    ("mode" = 'SHARED_SAAS' AND "identity_binding_id" IS NOT NULL AND (
      ("status" = 'PENDING_IDENTITY' AND "verified_at" IS NULL
        AND "verified_human_id" IS NULL AND "external_tenant_digest" IS NULL
        AND "completed_at" IS NULL AND "company_id" IS NULL)
      OR
      ("status" = 'IDENTITY_VERIFIED' AND "verified_at" IS NOT NULL
        AND "verified_human_id" IS NOT NULL AND "external_tenant_digest" IS NOT NULL
        AND "completed_at" IS NULL AND "company_id" IS NULL)
      OR
      ("status" = 'COMPLETED' AND "verified_at" IS NOT NULL
        AND "verified_human_id" IS NOT NULL AND "external_tenant_digest" IS NOT NULL
        AND "completed_at" IS NOT NULL AND "company_id" IS NOT NULL)
      OR
      ("status" = 'EXPIRED' AND "completed_at" IS NULL AND "company_id" IS NULL)
    ))
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_tenant_registration_slug_uq"
  ON "company_os_tenant_registration" ("slug") WHERE "status" <> 'EXPIRED';
--> statement-breakpoint
CREATE INDEX "company_os_tenant_registration_status_expiry_idx"
  ON "company_os_tenant_registration" ("status", "expires_at");
--> statement-breakpoint
CREATE TABLE "company_os_encrypted_secret" (
  "id" text PRIMARY KEY,
  "owner_reference" text NOT NULL,
  "purpose" text NOT NULL,
  "algorithm" text NOT NULL,
  "key_version" text NOT NULL,
  "nonce" text NOT NULL,
  "ciphertext" text NOT NULL,
  "authentication_tag" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "rotated_at" timestamptz,
  "revoked_at" timestamptz,
  CONSTRAINT "company_os_encrypted_secret_purpose_ck"
    CHECK ("purpose" IN ('IDENTITY_PROVIDER_CLIENT_SECRET', 'IDENTITY_PROVIDER_REFRESH_SECRET')),
  CONSTRAINT "company_os_encrypted_secret_algorithm_ck" CHECK ("algorithm" = 'AES-256-GCM'),
  CONSTRAINT "company_os_encrypted_secret_encoding_ck" CHECK (
    "nonce" ~ '^[A-Za-z0-9_-]{16}$'
    AND "ciphertext" ~ '^[A-Za-z0-9_-]+$'
    AND char_length("ciphertext") BETWEEN 2 AND 5462
    AND "authentication_tag" ~ '^[A-Za-z0-9_-]{22}$'
  )
);
--> statement-breakpoint
CREATE INDEX "company_os_encrypted_secret_owner_purpose_idx"
  ON "company_os_encrypted_secret" ("owner_reference", "purpose");
--> statement-breakpoint
CREATE TABLE "company_os_identity_binding" (
  "id" text PRIMARY KEY,
  "registration_id" text NOT NULL REFERENCES "company_os_tenant_registration"("id") ON DELETE RESTRICT,
  "company_id" text REFERENCES "company_os_company"("id") ON DELETE RESTRICT,
  "provider_family" text NOT NULL,
  "provider_key" text NOT NULL,
  "public_provider_id" text NOT NULL,
  "external_tenant_digest" text NOT NULL,
  "app_id" text NOT NULL,
  "secret_id" text NOT NULL REFERENCES "company_os_encrypted_secret"("id") ON DELETE RESTRICT,
  "status" text NOT NULL,
  "revision" integer NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "company_os_identity_binding_family_ck" CHECK ("provider_family" IN ('OAUTH2', 'OIDC')),
  CONSTRAINT "company_os_identity_binding_key_ck"
    CHECK (char_length("provider_key") BETWEEN 2 AND 32 AND "provider_key" ~ '^[a-z0-9-]+$'),
  CONSTRAINT "company_os_identity_binding_provider_id_ck"
    CHECK (char_length("public_provider_id") BETWEEN 3 AND 96 AND "public_provider_id" ~ '^[a-z0-9-]+$'),
  CONSTRAINT "company_os_identity_binding_tenant_ck"
    CHECK ("external_tenant_digest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "company_os_identity_binding_app_id_ck"
    CHECK (char_length("app_id") BETWEEN 3 AND 255 AND "app_id" ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT "company_os_identity_binding_status_ck"
    CHECK ("status" IN ('pending', 'active', 'suspended', 'revoked')),
  CONSTRAINT "company_os_identity_binding_revision_ck" CHECK ("revision" > 0),
  CONSTRAINT "company_os_identity_binding_company_ck" CHECK (
    ("status" = 'pending' AND "company_id" IS NULL)
    OR ("status" IN ('active', 'suspended', 'revoked') AND "company_id" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_identity_binding_registration_uq"
  ON "company_os_identity_binding" ("registration_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_identity_binding_provider_id_uq"
  ON "company_os_identity_binding" ("public_provider_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_identity_binding_app_id_uq"
  ON "company_os_identity_binding" ("provider_key", "app_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_identity_binding_external_tenant_uq"
  ON "company_os_identity_binding" ("provider_key", "external_tenant_digest");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_identity_binding_secret_uq"
  ON "company_os_identity_binding" ("secret_id");
--> statement-breakpoint
CREATE TABLE "company_os_external_identity" (
  "id" text PRIMARY KEY,
  "binding_id" text NOT NULL REFERENCES "company_os_identity_binding"("id") ON DELETE RESTRICT,
  "user_id" text NOT NULL REFERENCES "company_os_auth_user"("id") ON DELETE CASCADE,
  "external_subject_digest" text NOT NULL,
  "external_tenant_digest" text NOT NULL,
  "asserted_email_hmac" text,
  "verified_at" timestamptz NOT NULL,
  CONSTRAINT "company_os_external_identity_subject_ck"
    CHECK ("external_subject_digest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "company_os_external_identity_tenant_ck"
    CHECK ("external_tenant_digest" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT "company_os_external_identity_email_ck" CHECK (
    "asserted_email_hmac" IS NULL OR "asserted_email_hmac" ~ '^hmac-sha256:[a-f0-9]{64}$'
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_external_identity_binding_subject_uq"
  ON "company_os_external_identity" ("binding_id", "external_subject_digest");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_external_identity_binding_user_uq"
  ON "company_os_external_identity" ("binding_id", "user_id");
--> statement-breakpoint
ALTER TABLE "company_os_tenant_registration"
  ADD CONSTRAINT "company_os_tenant_registration_binding_uq" UNIQUE ("identity_binding_id");
