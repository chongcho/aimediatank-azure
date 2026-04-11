-- Removed: duplicate navbar eCard toggle (eCard is unified under mediaMessage / Celebration flow).
ALTER TABLE "HomeLayoutSetting" DROP COLUMN IF EXISTS "ecardEnabled";
