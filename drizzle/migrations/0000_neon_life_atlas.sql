CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."chapter_visibility" AS ENUM('PUBLIC', 'ANONYMOUS', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_code" text NOT NULL,
	"state_id" bigint,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"population" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" bigint PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "life_trails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"client_draft_id" uuid NOT NULL,
	"title" text DEFAULT 'My Life Trail' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trail_id" uuid NOT NULL,
	"from_city_id" bigint NOT NULL,
	"to_city_id" bigint NOT NULL,
	"move_year" integer NOT NULL,
	"reason" text DEFAULT 'Other' NOT NULL,
	"visibility" "chapter_visibility" DEFAULT 'PRIVATE' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" bigint PRIMARY KEY NOT NULL,
	"country_code" text NOT NULL,
	"admin1_code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_trails" ADD CONSTRAINT "life_trails_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_trail_id_life_trails_id_fk" FOREIGN KEY ("trail_id") REFERENCES "public"."life_trails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_from_city_id_cities_id_fk" FOREIGN KEY ("from_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_to_city_id_cities_id_fk" FOREIGN KEY ("to_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_idx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "cities_country_idx" ON "cities" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "cities_state_idx" ON "cities" USING btree ("state_id");--> statement-breakpoint
CREATE INDEX "cities_population_idx" ON "cities" USING btree ("population");--> statement-breakpoint
CREATE INDEX "life_trails_profile_idx" ON "life_trails" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "life_trails_profile_draft_idx" ON "life_trails" USING btree ("profile_id","client_draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movement_chapters_trail_position_idx" ON "movement_chapters" USING btree ("trail_id","position");--> statement-breakpoint
CREATE INDEX "movement_chapters_public_route_idx" ON "movement_chapters" USING btree ("visibility","from_city_id","to_city_id","move_year");--> statement-breakpoint
CREATE INDEX "movement_chapters_reason_idx" ON "movement_chapters" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "states_country_admin1_idx" ON "states" USING btree ("country_code","admin1_code");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "cities_name_prefix_idx" ON "cities" ((lower("name")) text_pattern_ops);--> statement-breakpoint
CREATE INDEX "cities_name_trgm_idx" ON "cities" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_population_check" CHECK ("population" >= 0);--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_year_check" CHECK ("move_year" BETWEEN 1900 AND 2100);--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_position_check" CHECK ("position" >= 0);--> statement-breakpoint
ALTER TABLE "movement_chapters" ADD CONSTRAINT "movement_chapters_different_cities_check" CHECK ("from_city_id" <> "to_city_id");
