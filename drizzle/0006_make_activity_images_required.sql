-- Make image fields required for activities (photo upload is mandatory)
ALTER TABLE "activities" ALTER COLUMN "image_url" SET NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "image_key" SET NOT NULL; 