CREATE TYPE "public"."contact_validation_status" AS ENUM('pending_contact', 'contact_confirmed', 'unreachable');--> statement-breakpoint
CREATE TYPE "public"."lead_grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "lead_score" integer;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "lead_grade" "lead_grade";--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "lead_score_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "contact_validation_status" "contact_validation_status" DEFAULT 'pending_contact' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "contact_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_location" ADD COLUMN "street_address" text;