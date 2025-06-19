CREATE TABLE IF NOT EXISTS "user_site_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"role" text DEFAULT 'worker' NOT NULL,
	"permissions" jsonb,
	"status" text DEFAULT 'active',
	"assigned_by" uuid,
	"assigned_date" timestamp DEFAULT now(),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_manager_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "image_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "image_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "material_requests" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 3);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "material_type" text;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "material_specifications" jsonb;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "requested_delivery_date" timestamp;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "delivery_instructions" text;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "material_requests" DROP COLUMN IF EXISTS "requested_date";--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN IF EXISTS "manager_id";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
