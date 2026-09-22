CREATE TYPE "public"."story_visibility" AS ENUM('PRIVATE', 'UNLISTED', 'PUBLIC');--> statement-breakpoint
CREATE TABLE "chapter_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_chapter_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"privacy_override" "story_visibility",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "life_trails" ADD COLUMN "public_title" text;--> statement-breakpoint
ALTER TABLE "life_trails" ADD COLUMN "visibility" "story_visibility" DEFAULT 'PRIVATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "life_trails" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "life_trails" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD COLUMN "memory_body" text;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD COLUMN "end_year" integer;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD COLUMN "privacy_override" "story_visibility";--> statement-breakpoint
ALTER TABLE "chapter_media" ADD CONSTRAINT "chapter_media_movement_chapter_id_movement_chapters_id_fk" FOREIGN KEY ("movement_chapter_id") REFERENCES "public"."movement_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_media_chapter_order_idx" ON "chapter_media" USING btree ("movement_chapter_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "life_trails_share_token_idx" ON "life_trails" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "life_trails_visibility_idx" ON "life_trails" USING btree ("visibility","updated_at");