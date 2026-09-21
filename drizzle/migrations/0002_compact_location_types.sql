ALTER TABLE "movement_chapters" DROP CONSTRAINT "movement_chapters_from_city_id_cities_id_fk";--> statement-breakpoint
ALTER TABLE "movement_chapters" DROP CONSTRAINT "movement_chapters_to_city_id_cities_id_fk";--> statement-breakpoint
ALTER TABLE "cities" DROP CONSTRAINT "cities_state_id_states_id_fk";--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "state_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "latitude" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "longitude" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "population" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "movement_chapters" ALTER COLUMN "from_city_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "movement_chapters" ALTER COLUMN "to_city_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "states" ALTER COLUMN "id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_from_city_id_cities_id_fk" FOREIGN KEY ("from_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_to_city_id_cities_id_fk" FOREIGN KEY ("to_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Population-positive places cover meaningful autocomplete while the complete 5.17M-row
-- corpus remains canonical and foreign-key addressable within the free-tier storage budget.
CREATE INDEX "cities_name_trgm_populated_idx" ON "cities" USING gin (lower("name") gin_trgm_ops) WHERE "population" > 0;
