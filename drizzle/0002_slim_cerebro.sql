CREATE TABLE IF NOT EXISTS "customer_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"full_name" varchar(255),
	"email" varchar(255),
	"occupation" varchar(255),
	"office_space_requirement" text,
	"office_space_use" text,
	"expected_price_range" varchar(100),
	"status" text DEFAULT 'inquiry',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
