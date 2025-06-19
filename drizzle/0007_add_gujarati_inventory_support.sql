-- Add Gujarati language support to inventory_items table
ALTER TABLE "inventory_items" ADD COLUMN "gujarati_name" varchar(255);
ALTER TABLE "inventory_items" ADD COLUMN "gujarati_unit" varchar(50);
ALTER TABLE "inventory_items" ADD COLUMN "gujarati_category" varchar(100);
ALTER TABLE "inventory_items" ADD COLUMN "item_code" varchar(50);

-- Add image support to inventory_transactions table (for mandatory images in Gujarati flow)
ALTER TABLE "inventory_transactions" ADD COLUMN "image_url" text;
ALTER TABLE "inventory_transactions" ADD COLUMN "image_key" text; 