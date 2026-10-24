-- Additive only. Apply on the existing PostgreSQL during an authorized deployment.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "SmsVerification" (
  "id" TEXT PRIMARY KEY,
  "phone" VARCHAR(11) NOT NULL,
  "purpose" VARCHAR(24) NOT NULL,
  "principal" TEXT NOT NULL DEFAULT '',
  "codeHash" VARCHAR(64) NOT NULL,
  "senderKey" VARCHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deliveredAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "SmsVerification_createdAt_idx" ON "SmsVerification"("createdAt");
CREATE INDEX IF NOT EXISTS "SmsVerification_phone_createdAt_idx" ON "SmsVerification"("phone", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsVerification_senderKey_createdAt_idx" ON "SmsVerification"("senderKey", "createdAt");
COMMIT;
