-- Additive profile storage; apply during deployment, without resetting users.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarKey" VARCHAR(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarImage" BYTEA;
COMMIT;
