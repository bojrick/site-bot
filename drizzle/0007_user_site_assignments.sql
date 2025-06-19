-- Migration: Add user-site assignments many-to-many relationship
-- Date: 2024-12-20

-- Add details field to users table
ALTER TABLE "users" ADD COLUMN "details" jsonb;

-- Create user_site_assignments table for many-to-many relationships
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

-- Create foreign key constraints
DO $$ BEGIN
 ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "user_site_assignments" ADD CONSTRAINT "user_site_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "user_site_assignments_user_id_idx" ON "user_site_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "user_site_assignments_site_id_idx" ON "user_site_assignments" ("site_id");
CREATE INDEX IF NOT EXISTS "user_site_assignments_status_idx" ON "user_site_assignments" ("status");

-- Migrate existing manager_id data to user_site_assignments
INSERT INTO "user_site_assignments" ("user_id", "site_id", "role", "status", "assigned_date")
SELECT "manager_id", "id", 'manager', 'active', "created_at"
FROM "sites" 
WHERE "manager_id" IS NOT NULL;

-- Drop the manager_id column from sites table
ALTER TABLE "sites" DROP COLUMN IF EXISTS "manager_id";

-- Drop the old foreign key constraint if it exists
DO $$ BEGIN
 ALTER TABLE "sites" DROP CONSTRAINT IF EXISTS "sites_manager_id_users_id_fk";
EXCEPTION
 WHEN undefined_object THEN null;
END $$; 