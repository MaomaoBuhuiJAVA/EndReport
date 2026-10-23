-- Reviewable PostgreSQL patch; apply only to the intended configured database.
-- This file is not executed by build/start and creates no demo scores.
BEGIN;
CREATE TABLE IF NOT EXISTS "ScienceGameProfile" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" VARCHAR(12) NOT NULL CHECK (char_length(btrim("name")) BETWEEN 1 AND 12),
  "age" VARCHAR(16) NOT NULL CHECK ("age" IN ('小班','中班','大班')),
  "avatar" VARCHAR(16) NOT NULL CHECK ("avatar" IN ('seed','planet','cloud')),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("id", "ownerId")
);
CREATE INDEX IF NOT EXISTS "ScienceGameProfile_ownerId_idx" ON "ScienceGameProfile"("ownerId");
CREATE TABLE IF NOT EXISTS "ScienceGameCompletion" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "profileId" TEXT NOT NULL,
  "gameId" VARCHAR(16) NOT NULL CHECK ("gameId" IN ('magnet','water','shadow')),
  "day" DATE NOT NULL,
  "completedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "points" INTEGER NOT NULL CHECK ("points" IN (0,10)),
  FOREIGN KEY ("profileId", "ownerId") REFERENCES "ScienceGameProfile"("id", "ownerId") ON DELETE CASCADE,
  UNIQUE ("profileId", "gameId", "day"),
  UNIQUE ("id", "ownerId", "profileId", "gameId")
);
CREATE INDEX IF NOT EXISTS "ScienceGameCompletion_ownerId_completedAt_idx" ON "ScienceGameCompletion"("ownerId", "completedAt");
CREATE INDEX IF NOT EXISTS "ScienceGameCompletion_day_profileId_idx" ON "ScienceGameCompletion"("day", "profileId");
CREATE TABLE IF NOT EXISTS "ScienceGameEvent" (
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "eventId" VARCHAR(128) NOT NULL,
  "profileId" TEXT NOT NULL,
  "gameId" VARCHAR(16) NOT NULL,
  "completionId" TEXT NOT NULL,
  "points" INTEGER NOT NULL CHECK ("points" IN (0,10)),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("ownerId", "eventId"),
  FOREIGN KEY ("completionId", "ownerId", "profileId", "gameId") REFERENCES "ScienceGameCompletion"("id", "ownerId", "profileId", "gameId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScienceGameEvent_completionId_idx" ON "ScienceGameEvent"("completionId");
COMMIT;
