ALTER TABLE "chapter_media" ADD COLUMN "byte_size" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "chapter_media_created_at_idx" ON "chapter_media" USING btree ("created_at");
