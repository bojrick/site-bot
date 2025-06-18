ALTER TABLE "users" ADD COLUMN "introduction_sent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "introduction_sent_at" timestamp;