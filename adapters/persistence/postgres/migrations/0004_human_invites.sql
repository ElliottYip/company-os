CREATE TABLE "company_os_human_invite" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "company_os_company"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expected_email" text NOT NULL,
  "department_id" text NOT NULL,
  "title" text NOT NULL,
  "membership_role" text NOT NULL,
  "invited_by_user_id" text NOT NULL REFERENCES "company_os_auth_user"("id") ON DELETE RESTRICT,
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "accepted_by_user_id" text REFERENCES "company_os_auth_user"("id") ON DELETE RESTRICT,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "company_os_human_invite_role_ck" CHECK ("membership_role" IN ('owner', 'admin', 'operator', 'viewer')),
  CONSTRAINT "company_os_human_invite_email_ck" CHECK ("expected_email" = lower("expected_email")),
  CONSTRAINT "company_os_human_invite_acceptance_ck" CHECK (("accepted_at" IS NULL) = ("accepted_by_user_id" IS NULL)),
  CONSTRAINT "company_os_human_invite_terminal_ck" CHECK (NOT ("accepted_at" IS NOT NULL AND "revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_human_invite_token_hash_uq"
  ON "company_os_human_invite" ("token_hash");
--> statement-breakpoint
CREATE INDEX "company_os_human_invite_company_state_idx"
  ON "company_os_human_invite" ("company_id", "accepted_at", "revoked_at", "expires_at");
