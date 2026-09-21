-- The first location load was intentionally stopped by Neon's 512 MB project limit.
-- Discard only that incomplete, reproducible dataset before compacting the canonical IDs.
TRUNCATE TABLE "cities" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "cities_name_prefix_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cities_name_trgm_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cities_country_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cities_state_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cities_population_idx";
