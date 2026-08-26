CREATE TABLE "company_os_connector_outbox" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "company_os_company"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "topic" text NOT NULL,
  "partition_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" text NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "delivered_at" text,
  CONSTRAINT "company_os_connector_outbox_sequence_ck" CHECK ("sequence" > 0),
  CONSTRAINT "company_os_connector_outbox_status_ck" CHECK ("status" IN ('PENDING', 'DELIVERED')),
  CONSTRAINT "company_os_connector_outbox_delivery_ck" CHECK (
    ("status" = 'PENDING' AND "delivered_at" IS NULL) OR
    ("status" = 'DELIVERED' AND "delivered_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_connector_outbox_company_sequence_uq"
  ON "company_os_connector_outbox" ("company_id", "sequence");
--> statement-breakpoint
CREATE INDEX "company_os_connector_outbox_pending_idx"
  ON "company_os_connector_outbox" ("company_id", "status", "sequence");
--> statement-breakpoint
CREATE TABLE "company_os_projection_checkpoint" (
  "company_id" text NOT NULL REFERENCES "company_os_company"("id") ON DELETE CASCADE,
  "projection_name" text NOT NULL,
  "event_sequence" integer NOT NULL,
  "updated_at" text NOT NULL,
  CONSTRAINT "company_os_projection_checkpoint_pk" PRIMARY KEY ("company_id", "projection_name"),
  CONSTRAINT "company_os_projection_checkpoint_sequence_ck" CHECK ("event_sequence" >= 0)
);
