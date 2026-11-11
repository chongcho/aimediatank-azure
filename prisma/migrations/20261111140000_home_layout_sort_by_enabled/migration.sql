-- Homepage Sort by dropdown visibility (admin Home Layout ON/OFF).
ALTER TABLE "HomeLayoutSetting" ADD COLUMN IF NOT EXISTS "sortByEnabled" BOOLEAN NOT NULL DEFAULT true;
