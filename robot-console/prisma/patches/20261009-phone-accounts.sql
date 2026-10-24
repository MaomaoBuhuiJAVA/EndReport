-- Additive migration: preserves existing users, passwords and business data.
BEGIN;
DO $$ BEGIN
  CREATE TYPE "AccountType" AS ENUM ('PARENT', 'TEACHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(11);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" "AccountType";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "identityVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
COMMIT;
