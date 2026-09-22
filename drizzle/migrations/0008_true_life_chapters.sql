CREATE TABLE "life_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trail_id" uuid NOT NULL,
	"city_id" integer NOT NULL,
	"arrival_year" integer,
	"end_year" integer,
	"reason" text DEFAULT 'Other' NOT NULL,
	"title" text,
	"memory_body" text,
	"privacy_override" "story_visibility",
	"visibility" "chapter_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "life_chapters" ADD CONSTRAINT "life_chapters_trail_id_life_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."life_trails"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "life_chapters" ADD CONSTRAINT "life_chapters_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "life_chapters_trail_position_idx" ON "life_chapters" USING btree ("trail_id","position");
--> statement-breakpoint
CREATE INDEX "life_chapters_city_year_idx" ON "life_chapters" USING btree ("city_id","arrival_year");
--> statement-breakpoint
CREATE INDEX "life_chapters_visibility_idx" ON "life_chapters" USING btree ("visibility","city_id");
--> statement-breakpoint
INSERT INTO "life_chapters" ("id", "trail_id", "city_id", "arrival_year", "end_year", "reason", "title", "memory_body", "privacy_override", "visibility", "position", "created_at", "updated_at")
SELECT movement.id, movement.trail_id, movement.to_city_id, movement.move_year, movement.end_year, movement.reason, movement.title, movement.memory_body, movement.privacy_override, movement.visibility, movement.position + 1, movement.created_at, movement.updated_at
FROM "movement_chapters" movement
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "life_chapters" ("trail_id", "city_id", "arrival_year", "reason", "visibility", "position", "created_at", "updated_at")
SELECT DISTINCT ON (movement.trail_id) movement.trail_id, movement.from_city_id, NULL, 'Other', movement.visibility, 0, movement.created_at, movement.updated_at
FROM "movement_chapters" movement
ORDER BY movement.trail_id, movement.position
ON CONFLICT ("trail_id", "position") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "chapter_media" ADD COLUMN "life_chapter_id" uuid;
--> statement-breakpoint
UPDATE "chapter_media" SET "life_chapter_id" = "movement_chapter_id" WHERE "life_chapter_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "chapter_media" ALTER COLUMN "movement_chapter_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "chapter_media" ADD CONSTRAINT "chapter_media_life_chapter_id_life_chapters_id_fk" FOREIGN KEY ("life_chapter_id") REFERENCES "public"."life_chapters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chapter_media" ADD CONSTRAINT "chapter_media_chapter_reference_check" CHECK ("life_chapter_id" IS NOT NULL OR "movement_chapter_id" IS NOT NULL);
--> statement-breakpoint
CREATE INDEX "chapter_media_life_chapter_order_idx" ON "chapter_media" USING btree ("life_chapter_id","display_order");
--> statement-breakpoint
ALTER TABLE "chapter_people" ADD COLUMN "life_chapter_id" uuid;
--> statement-breakpoint
UPDATE "chapter_people" SET "life_chapter_id" = "chapter_id" WHERE "life_chapter_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "chapter_people" ALTER COLUMN "chapter_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "chapter_people" ADD CONSTRAINT "chapter_people_life_chapter_id_life_chapters_id_fk" FOREIGN KEY ("life_chapter_id") REFERENCES "public"."life_chapters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chapter_people" ADD CONSTRAINT "chapter_people_chapter_reference_check" CHECK ("life_chapter_id" IS NOT NULL OR "chapter_id" IS NOT NULL);
--> statement-breakpoint
CREATE INDEX "chapter_people_life_chapter_idx" ON "chapter_people" USING btree ("life_chapter_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_people_life_chapter_target_idx" ON "chapter_people" USING btree ("life_chapter_id","target_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_people_life_chapter_placeholder_idx" ON "chapter_people" USING btree ("life_chapter_id", lower("placeholder_name")) WHERE "target_profile_id" IS NULL;
