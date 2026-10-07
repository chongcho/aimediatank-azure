-- Homepage default sort is Random for visitors who have not saved a preference.
ALTER TABLE "HomeLayoutSetting" ALTER COLUMN "defaultSort" SET DEFAULT 'random';
UPDATE "HomeLayoutSetting" SET "defaultSort" = 'random' WHERE "defaultSort" = 'popular';
