CREATE TYPE "public"."directory_kind" AS ENUM('place', 'provider');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('core', 'secondary', 'verify', 'inactive');--> statement-breakpoint
CREATE TABLE "directory_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_id" uuid NOT NULL,
	"kind" "directory_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" text,
	"source_dataset" text NOT NULL,
	"external_id" text NOT NULL,
	"blurb" text,
	"about" text,
	"access_note" text,
	"website_url" text,
	"booking_url" text,
	"city" text,
	"state" text,
	"address" text,
	"additional_locations" text,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facts_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publication_status" "content_status" DEFAULT 'draft' NOT NULL,
	"evidence_status" "evidence_status" DEFAULT 'verify' NOT NULL,
	"source_quality" char(1),
	"source_urls_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_note" text,
	"last_verified_at" date,
	"provider_company_id" uuid,
	"imported_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory_profile" ADD CONSTRAINT "directory_profile_marketplace_id_marketplace_id_fk" FOREIGN KEY ("marketplace_id") REFERENCES "public"."marketplace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_profile" ADD CONSTRAINT "directory_profile_provider_company_id_provider_company_id_fk" FOREIGN KEY ("provider_company_id") REFERENCES "public"."provider_company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "directory_profile_slug_key" ON "directory_profile" USING btree ("marketplace_id","kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "directory_profile_source_key" ON "directory_profile" USING btree ("marketplace_id","source_dataset","external_id");--> statement-breakpoint
CREATE INDEX "directory_profile_public_idx" ON "directory_profile" USING btree ("marketplace_id","kind","publication_status","evidence_status");--> statement-breakpoint
CREATE INDEX "directory_profile_state_idx" ON "directory_profile" USING btree ("marketplace_id","kind","state");