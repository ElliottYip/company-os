CREATE TABLE "company_os_domain_event" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "company_os_company"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "type" text NOT NULL,
  "occurred_at" text NOT NULL,
  "stored_at" timestamptz DEFAULT now() NOT NULL,
  "actor_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "correlation_id" text,
  "causation_id" text,
  "provenance" text NOT NULL,
  CONSTRAINT "company_os_domain_event_sequence_ck" CHECK ("sequence" > 0),
  CONSTRAINT "company_os_domain_event_provenance_ck" CHECK ("provenance" IN ('PRODUCTION', 'DEMO_FIXTURE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_os_domain_event_company_sequence_uq"
  ON "company_os_domain_event" ("company_id", "sequence");
--> statement-breakpoint
CREATE INDEX "company_os_domain_event_company_type_sequence_idx"
  ON "company_os_domain_event" ("company_id", "type", "sequence");
