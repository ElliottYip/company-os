CREATE TABLE "company_os_company" (
  "id" text PRIMARY KEY, "name" text NOT NULL, "purpose" text NOT NULL, "locale" text NOT NULL,
  "default_responsible_user_id" text NOT NULL
    REFERENCES "company_os_auth_user"("id") ON DELETE RESTRICT,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "company_os_company_status_ck" CHECK ("status" IN ('active', 'paused', 'archived'))
);

--> statement-breakpoint
CREATE TABLE "company_os_company_membership" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "company_os_company"("id") ON DELETE CASCADE,
  "principal_type" text NOT NULL, "principal_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL, "membership_role" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "company_os_membership_principal_type_ck" CHECK ("principal_type" IN ('user', 'agent')),
  CONSTRAINT "company_os_membership_status_ck" CHECK ("status" IN ('pending', 'active', 'suspended', 'archived')),
  CONSTRAINT "company_os_membership_role_ck" CHECK (
    ("principal_type" = 'user' AND "membership_role" IN ('owner', 'admin', 'operator', 'viewer')) OR
    ("principal_type" = 'agent' AND "membership_role" = 'member')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_membership_company_principal_uq"
  ON "company_os_company_membership" ("company_id", "principal_type", "principal_id");
--> statement-breakpoint
CREATE INDEX "company_os_membership_principal_status_idx"
  ON "company_os_company_membership" ("principal_type", "principal_id", "status");
--> statement-breakpoint
CREATE INDEX "company_os_membership_company_status_idx"
  ON "company_os_company_membership" ("company_id", "status");

--> statement-breakpoint
CREATE TABLE "company_os_instance_user_role" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "company_os_auth_user"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'instance_admin' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "company_os_instance_user_role_ck" CHECK ("role" = 'instance_admin')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_instance_user_role_uq"
  ON "company_os_instance_user_role" ("user_id", "role");
--> statement-breakpoint
CREATE INDEX "company_os_instance_user_role_role_idx" ON "company_os_instance_user_role" ("role");

--> statement-breakpoint
CREATE TABLE "company_os_principal_permission_grant" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "company_os_company"("id") ON DELETE CASCADE,
  "principal_type" text NOT NULL, "principal_id" text NOT NULL,
  "permission_key" text NOT NULL, "scope" jsonb,
  "granted_by_user_id" text REFERENCES "company_os_auth_user"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "company_os_permission_principal_type_ck" CHECK ("principal_type" IN ('user', 'agent'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_principal_permission_uq"
  ON "company_os_principal_permission_grant" ("company_id", "principal_type", "principal_id", "permission_key");
--> statement-breakpoint
CREATE INDEX "company_os_principal_permission_company_key_idx"
  ON "company_os_principal_permission_grant" ("company_id", "permission_key");
