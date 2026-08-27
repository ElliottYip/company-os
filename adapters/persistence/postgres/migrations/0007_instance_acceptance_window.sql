ALTER TABLE "company_os_instance_maintenance"
  ADD COLUMN "acceptance_binding" jsonb;
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance_event"
  ADD COLUMN "acceptance_binding" jsonb;
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance"
  DROP CONSTRAINT "company_os_instance_maintenance_mode_ck";
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance"
  ADD CONSTRAINT "company_os_instance_maintenance_mode_ck"
  CHECK ("mode" IN ('OPEN', 'DISPATCH_FROZEN', 'ACCEPTANCE_ONLY'));
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance_event"
  DROP CONSTRAINT "company_os_instance_maintenance_event_mode_ck";
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance_event"
  ADD CONSTRAINT "company_os_instance_maintenance_event_mode_ck"
  CHECK ("mode" IN ('OPEN', 'DISPATCH_FROZEN', 'ACCEPTANCE_ONLY'));
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance"
  ADD CONSTRAINT "company_os_instance_maintenance_acceptance_ck" CHECK (
    ("mode" <> 'ACCEPTANCE_ONLY' AND "acceptance_binding" IS NULL) OR
    ("mode" = 'ACCEPTANCE_ONLY' AND jsonb_typeof("acceptance_binding") = 'object'
      AND jsonb_typeof("acceptance_binding"->'planId') = 'string'
      AND jsonb_typeof("acceptance_binding"->'planDigest') = 'string'
      AND jsonb_typeof("acceptance_binding"->'work') = 'array'
      AND jsonb_array_length("acceptance_binding"->'work') BETWEEN 1 AND 32)
  );
--> statement-breakpoint
ALTER TABLE "company_os_instance_maintenance_event"
  ADD CONSTRAINT "company_os_instance_maintenance_event_acceptance_ck" CHECK (
    ("mode" <> 'ACCEPTANCE_ONLY' AND "acceptance_binding" IS NULL) OR
    ("mode" = 'ACCEPTANCE_ONLY' AND jsonb_typeof("acceptance_binding") = 'object'
      AND jsonb_typeof("acceptance_binding"->'planId') = 'string'
      AND jsonb_typeof("acceptance_binding"->'planDigest') = 'string'
      AND jsonb_typeof("acceptance_binding"->'work') = 'array'
      AND jsonb_array_length("acceptance_binding"->'work') BETWEEN 1 AND 32)
  );
