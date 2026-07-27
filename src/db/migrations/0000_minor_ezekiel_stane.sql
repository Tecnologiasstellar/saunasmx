CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content_markdown" text NOT NULL,
	"seo_meta_description" text NOT NULL,
	"json_ld_schema" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"vector_embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_key" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "posts_published_at_idx" ON "posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "posts_embedding_idx" ON "posts" USING hnsw ("vector_embedding" vector_cosine_ops);