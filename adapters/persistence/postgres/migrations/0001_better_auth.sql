CREATE TABLE "company_os_auth_user" (
  "id" text PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL, "image" text,
  "created_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_auth_user_email_uq" ON "company_os_auth_user" ("email");

--> statement-breakpoint
CREATE TABLE "company_os_auth_session" (
  "id" text PRIMARY KEY, "expires_at" timestamptz NOT NULL, "token" text NOT NULL,
  "created_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL,
  "ip_address" text, "user_agent" text, "user_id" text NOT NULL
    REFERENCES "company_os_auth_user"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_auth_session_token_uq" ON "company_os_auth_session" ("token");

--> statement-breakpoint
CREATE TABLE "company_os_auth_account" (
  "id" text PRIMARY KEY, "account_id" text NOT NULL, "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "company_os_auth_user"("id") ON DELETE CASCADE,
  "access_token" text, "refresh_token" text, "id_token" text,
  "access_token_expires_at" timestamptz, "refresh_token_expires_at" timestamptz,
  "scope" text, "password" text, "created_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_auth_account_provider_uq" ON "company_os_auth_account" ("provider_id", "account_id");

--> statement-breakpoint
CREATE TABLE "company_os_auth_verification" (
  "id" text PRIMARY KEY, "identifier" text NOT NULL, "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL, "created_at" timestamptz, "updated_at" timestamptz
);

--> statement-breakpoint
CREATE TABLE "company_os_auth_rate_limit" (
  "id" text PRIMARY KEY, "key" text NOT NULL, "count" integer NOT NULL, "last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_auth_rate_limit_key_uq" ON "company_os_auth_rate_limit" ("key");
