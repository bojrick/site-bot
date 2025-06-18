ALTER TABLE "activities" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "image_key" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activities" ADD CONSTRAINT "activities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
