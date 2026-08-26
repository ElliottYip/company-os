CREATE TABLE "company_os_instance_maintenance" (
  "id" text PRIMARY KEY,
  "mode" text NOT NULL,
  "revision" integer NOT NULL,
  "operation_id" text NOT NULL,
  "authorization_reference" text NOT NULL,
  "changed_by_user_id" text NOT NULL REFERENCES "company_os_auth_user"("id") ON DELETE RESTRICT,
  "changed_at" text NOT NULL,
  CONSTRAINT "company_os_instance_maintenance_singleton_ck" CHECK ("id" = 'instance'),
  CONSTRAINT "company_os_instance_maintenance_mode_ck" CHECK ("mode" IN ('OPEN', 'DISPATCH_FROZEN')),
  CONSTRAINT "company_os_instance_maintenance_revision_ck" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "company_os_instance_maintenance_event" (
  "id" text PRIMARY KEY,
  "revision" integer NOT NULL,
  "mode" text NOT NULL,
  "operation_id" text NOT NULL,
  "authorization_reference" text NOT NULL,
  "changed_by_user_id" text NOT NULL REFERENCES "company_os_auth_user"("id") ON DELETE RESTRICT,
  "changed_at" text NOT NULL,
  CONSTRAINT "company_os_instance_maintenance_event_mode_ck" CHECK ("mode" IN ('OPEN', 'DISPATCH_FROZEN')),
  CONSTRAINT "company_os_instance_maintenance_event_revision_ck" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_instance_maintenance_event_revision_uq"
  ON "company_os_instance_maintenance_event" ("revision");
