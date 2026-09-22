CREATE TABLE "country_map_anchors" (
	"country_code" text PRIMARY KEY NOT NULL,
	"city_id" integer NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country_map_anchors" ADD CONSTRAINT "country_map_anchors_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_map_anchors" ADD CONSTRAINT "country_map_anchors_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "country_map_anchors" ("country_code", "city_id", "latitude", "longitude")
SELECT DISTINCT ON ("country_code") "country_code", "id", "latitude", "longitude"
FROM "cities"
WHERE "population" > 0
ORDER BY "country_code", "population" DESC;
