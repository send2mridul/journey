CREATE TABLE "migrant_stock" (
	"source_id" text NOT NULL,
	"year" integer NOT NULL,
	"origin_country_code" text NOT NULL,
	"destination_country_code" text NOT NULL,
	"stock" bigint NOT NULL,
	CONSTRAINT "migrant_stock_source_id_year_origin_country_code_destination_country_code_pk" PRIMARY KEY("source_id","year","origin_country_code","destination_country_code")
);
--> statement-breakpoint
CREATE TABLE "migration_data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"dataset_name" text NOT NULL,
	"version" text NOT NULL,
	"source_url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "migrant_stock" ADD CONSTRAINT "migrant_stock_source_id_migration_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."migration_data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migrant_stock" ADD CONSTRAINT "migrant_stock_origin_country_code_countries_code_fk" FOREIGN KEY ("origin_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migrant_stock" ADD CONSTRAINT "migrant_stock_destination_country_code_countries_code_fk" FOREIGN KEY ("destination_country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "migrant_stock_origin_year_idx" ON "migrant_stock" USING btree ("origin_country_code","year","stock");--> statement-breakpoint
CREATE INDEX "migrant_stock_destination_year_idx" ON "migrant_stock" USING btree ("destination_country_code","year","stock");