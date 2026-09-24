-- New signed-in Life Atlases are shared with accepted friends by default.
-- Existing rows are intentionally untouched: users who chose PRIVATE remain private
-- until they explicitly change the setting in the product.
ALTER TABLE "life_trails"
  ALTER COLUMN "visibility" SET DEFAULT 'FRIENDS'::"story_visibility";
