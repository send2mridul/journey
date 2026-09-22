CREATE TABLE "guest_save_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"draft" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_save_handoffs_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "guest_save_handoffs_expiry_idx" ON "guest_save_handoffs" USING btree ("expires_at");
