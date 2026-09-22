-- Catch up trails written by the previous deployment during the additive
-- life_chapters rollout window. Safe to run repeatedly in a transaction.
INSERT INTO "life_chapters" ("id", "trail_id", "city_id", "arrival_year", "end_year", "reason", "title", "memory_body", "privacy_override", "visibility", "position", "created_at", "updated_at")
SELECT movement.id, movement.trail_id, movement.to_city_id, movement.move_year, movement.end_year, movement.reason, movement.title, movement.memory_body, movement.privacy_override, movement.visibility, movement.position + 1, movement.created_at, movement.updated_at
FROM "movement_chapters" movement
WHERE NOT EXISTS (SELECT 1 FROM "life_chapters" chapter WHERE chapter.id = movement.id)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "life_chapters" ("trail_id", "city_id", "arrival_year", "reason", "visibility", "position", "created_at", "updated_at")
SELECT DISTINCT ON (movement.trail_id) movement.trail_id, movement.from_city_id, NULL, 'Other', movement.visibility, 0, movement.created_at, movement.updated_at
FROM "movement_chapters" movement
WHERE NOT EXISTS (SELECT 1 FROM "life_chapters" chapter WHERE chapter.trail_id = movement.trail_id AND chapter.position = 0)
ORDER BY movement.trail_id, movement.position
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "chapter_media" media
SET "life_chapter_id" = media."movement_chapter_id"
WHERE media."life_chapter_id" IS NULL
  AND EXISTS (SELECT 1 FROM "life_chapters" chapter WHERE chapter.id = media."movement_chapter_id");
--> statement-breakpoint
UPDATE "chapter_people" person
SET "life_chapter_id" = person."chapter_id"
WHERE person."life_chapter_id" IS NULL
  AND EXISTS (SELECT 1 FROM "life_chapters" chapter WHERE chapter.id = person."chapter_id");
