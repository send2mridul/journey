CREATE TYPE "public"."chapter_person_status" AS ENUM('PLACEHOLDER', 'PENDING', 'CONFIRMED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."friend_list_visibility" AS ENUM('ONLY_ME', 'FRIENDS');--> statement-breakpoint
CREATE TYPE "public"."profile_discoverability" AS ENUM('DISCOVERABLE', 'LIMITED', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."shared_moment_status" AS ENUM('PENDING', 'CONFIRMED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."social_invite_kind" AS ENUM('CONNECTION', 'CHAPTER', 'COMPARE');--> statement-breakpoint
CREATE TABLE "chapter_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"owner_profile_id" uuid NOT NULL,
	"target_profile_id" uuid,
	"placeholder_name" text,
	"status" "chapter_person_status" NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_people_target_or_placeholder_check" CHECK (("chapter_people"."target_profile_id" IS NOT NULL) <> ("chapter_people"."placeholder_name" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "connection_permissions" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"low_compare_allowed" boolean DEFAULT false NOT NULL,
	"high_compare_allowed" boolean DEFAULT false NOT NULL,
	"low_atlas_shared" boolean DEFAULT false NOT NULL,
	"high_atlas_shared" boolean DEFAULT false NOT NULL,
	"low_external_share_allowed" boolean DEFAULT false NOT NULL,
	"high_external_share_allowed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"low_profile_id" uuid NOT NULL,
	"high_profile_id" uuid NOT NULL,
	"requester_profile_id" uuid NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"status" "connection_status" DEFAULT 'PENDING' NOT NULL,
	"blocked_by_profile_id" uuid,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_distinct_profiles_check" CHECK ("connections"."low_profile_id" <> "connections"."high_profile_id"),
	CONSTRAINT "connections_canonical_order_check" CHECK ("connections"."low_profile_id"::text < "connections"."high_profile_id"::text),
	CONSTRAINT "connections_participants_check" CHECK (("connections"."requester_profile_id" = "connections"."low_profile_id" AND "connections"."recipient_profile_id" = "connections"."high_profile_id") OR ("connections"."requester_profile_id" = "connections"."high_profile_id" AND "connections"."recipient_profile_id" = "connections"."low_profile_id")),
	CONSTRAINT "connections_blocker_check" CHECK ("connections"."blocked_by_profile_id" IS NULL OR "connections"."blocked_by_profile_id" IN ("connections"."low_profile_id", "connections"."high_profile_id"))
);
--> statement-breakpoint
CREATE TABLE "shared_moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"proposed_by_profile_id" uuid NOT NULL,
	"city_id" integer,
	"city_name" text NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"title" text,
	"memory_body" text,
	"status" "shared_moment_status" DEFAULT 'PENDING' NOT NULL,
	"low_profile_visible" boolean DEFAULT false NOT NULL,
	"high_profile_visible" boolean DEFAULT false NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"actor_profile_id" uuid,
	"connection_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_profile_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"kind" "social_invite_kind" NOT NULL,
	"chapter_person_id" uuid,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by_profile_id" uuid,
	"claimed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "social_rate_limits" (
	"profile_id" uuid NOT NULL,
	"action" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "social_rate_limits_profile_id_action_window_started_at_pk" PRIMARY KEY("profile_id","action","window_started_at")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "handle_normalized" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "discoverability" "profile_discoverability" DEFAULT 'LIMITED' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "friend_list_visibility" "friend_list_visibility" DEFAULT 'ONLY_ME' NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter_people" ADD CONSTRAINT "chapter_people_chapter_id_movement_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."movement_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_people" ADD CONSTRAINT "chapter_people_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_people" ADD CONSTRAINT "chapter_people_target_profile_id_profiles_id_fk" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_permissions" ADD CONSTRAINT "connection_permissions_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_low_profile_id_profiles_id_fk" FOREIGN KEY ("low_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_high_profile_id_profiles_id_fk" FOREIGN KEY ("high_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_requester_profile_id_profiles_id_fk" FOREIGN KEY ("requester_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_blocked_by_profile_id_profiles_id_fk" FOREIGN KEY ("blocked_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_moments" ADD CONSTRAINT "shared_moments_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_moments" ADD CONSTRAINT "shared_moments_proposed_by_profile_id_profiles_id_fk" FOREIGN KEY ("proposed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_moments" ADD CONSTRAINT "shared_moments_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_activities" ADD CONSTRAINT "social_activities_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_invites" ADD CONSTRAINT "social_invites_inviter_profile_id_profiles_id_fk" FOREIGN KEY ("inviter_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_invites" ADD CONSTRAINT "social_invites_chapter_person_id_chapter_people_id_fk" FOREIGN KEY ("chapter_person_id") REFERENCES "public"."chapter_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_invites" ADD CONSTRAINT "social_invites_claimed_by_profile_id_profiles_id_fk" FOREIGN KEY ("claimed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_rate_limits" ADD CONSTRAINT "social_rate_limits_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_people_chapter_idx" ON "chapter_people" USING btree ("chapter_id","status");--> statement-breakpoint
CREATE INDEX "chapter_people_target_status_idx" ON "chapter_people" USING btree ("target_profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX "chapter_people_owner_idx" ON "chapter_people" USING btree ("owner_profile_id","chapter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_people_chapter_target_idx" ON "chapter_people" USING btree ("chapter_id","target_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_people_placeholder_idx" ON "chapter_people" USING btree ("chapter_id", lower("placeholder_name")) WHERE "target_profile_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_canonical_pair_idx" ON "connections" USING btree ("low_profile_id","high_profile_id");--> statement-breakpoint
CREATE INDEX "connections_low_status_idx" ON "connections" USING btree ("low_profile_id","status");--> statement-breakpoint
CREATE INDEX "connections_high_status_idx" ON "connections" USING btree ("high_profile_id","status");--> statement-breakpoint
CREATE INDEX "connections_recipient_status_idx" ON "connections" USING btree ("recipient_profile_id","status","created_at");--> statement-breakpoint
CREATE INDEX "shared_moments_connection_status_idx" ON "shared_moments" USING btree ("connection_id","status","created_at");--> statement-breakpoint
CREATE INDEX "social_activities_recipient_idx" ON "social_activities" USING btree ("recipient_profile_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "social_invites_inviter_active_idx" ON "social_invites" USING btree ("inviter_profile_id","expires_at");--> statement-breakpoint
CREATE INDEX "social_invites_chapter_person_idx" ON "social_invites" USING btree ("chapter_person_id");--> statement-breakpoint
CREATE INDEX "social_rate_limits_cleanup_idx" ON "social_rate_limits" USING btree ("window_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_handle_normalized_idx" ON "profiles" USING btree ("handle_normalized");--> statement-breakpoint
CREATE INDEX "profiles_discoverability_handle_idx" ON "profiles" USING btree ("discoverability","handle_normalized");--> statement-breakpoint
CREATE INDEX "profiles_display_name_idx" ON "profiles" USING btree ("display_name");
