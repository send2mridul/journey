ALTER TABLE "life_trails" ALTER COLUMN "profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "life_trails" ADD COLUMN "anonymous_owner_hash" text;--> statement-breakpoint
ALTER TABLE "life_trails" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "life_trails_anonymous_owner_idx" ON "life_trails" USING btree ("anonymous_owner_hash");--> statement-breakpoint
ALTER TABLE "life_trails" ADD CONSTRAINT "life_trails_owner_check" CHECK ("life_trails"."profile_id" IS NOT NULL OR "life_trails"."anonymous_owner_hash" IS NOT NULL);