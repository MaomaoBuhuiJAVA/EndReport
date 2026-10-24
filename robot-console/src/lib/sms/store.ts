import {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {validSmsRecord, type SmsStore, type SmsRecord, type SmsClaim} from "./service";

// Prisma DateTime columns contain UTC without a time zone. Raw Date parameters
// are timestamptz, so bind UTC ISO text and cast to timestamp explicitly; this
// prevents the database's Asia/Shanghai timezone from shifting times by 8 hours.
const timestamp = (date: Date) => date.toISOString();
// All instances share PostgreSQL locks and quotas; no in-memory authentication fallback.
export const postgresSmsStore: SmsStore = {
  async reserve(record) {
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('guoke:sms:send'))`;
      await tx.$executeRaw`DELETE FROM "SmsVerification" WHERE "createdAt" < ${timestamp(new Date(record.createdAt.getTime() - 172800000))}::timestamp`;
      const [count] = await tx.$queryRaw<Array<{lastPhone: Date | null; phoneHour: bigint; phoneDay: bigint; senderHour: bigint; senderDay: bigint; total: bigint}>>`
        SELECT MAX("createdAt") FILTER (WHERE "phone" = ${record.phone}) AS "lastPhone",
          COUNT(*) FILTER (WHERE "phone" = ${record.phone} AND "createdAt" > ${timestamp(new Date(record.createdAt.getTime() - 3600000))}::timestamp) AS "phoneHour",
          COUNT(*) FILTER (WHERE "phone" = ${record.phone}) AS "phoneDay",
          COUNT(*) FILTER (WHERE "senderKey" = ${record.senderKey} AND "createdAt" > ${timestamp(new Date(record.createdAt.getTime() - 3600000))}::timestamp) AS "senderHour",
          COUNT(*) FILTER (WHERE "senderKey" = ${record.senderKey}) AS "senderDay", COUNT(*) AS "total"
        FROM "SmsVerification" WHERE "createdAt" > ${timestamp(new Date(record.createdAt.getTime() - 86400000))}::timestamp`;
      if (count.lastPhone && count.lastPhone.getTime() + 60000 > record.createdAt.getTime()) return Math.ceil((count.lastPhone.getTime() + 60000 - record.createdAt.getTime()) / 1000);
      if (Number(count.phoneDay) >= 20 || Number(count.senderDay) >= 60 || Number(count.total) >= 500) return 86400;
      if (Number(count.phoneHour) >= 5 || Number(count.senderHour) >= 20) return 3600;
      await tx.$executeRaw`INSERT INTO "SmsVerification" ("id", "phone", "purpose", "principal", "codeHash", "senderKey", "createdAt", "expiresAt", "attempts")
        VALUES (${record.id}, ${record.phone}, ${record.purpose}, ${record.principal}, ${record.codeHash}, ${record.senderKey}, ${timestamp(record.createdAt)}::timestamp, ${timestamp(record.expiresAt)}::timestamp, 0)`;
      return null;
    });
  },
  async markDelivered(id, now) {await prisma.$executeRaw`UPDATE "SmsVerification" SET "deliveredAt" = ${timestamp(now)}::timestamp WHERE "id" = ${id}`;},
  async markFailed(id, now) {await prisma.$executeRaw`UPDATE "SmsVerification" SET "consumedAt" = ${timestamp(now)}::timestamp WHERE "id" = ${id}`;},
  async consume(claims: SmsClaim[], now) {
    return prisma.$transaction(async tx => {
      const records = await tx.$queryRaw<SmsRecord[]>(Prisma.sql`SELECT * FROM "SmsVerification" WHERE "id" IN (${Prisma.join(claims.map(claim => claim.id))}) ORDER BY "id" FOR UPDATE`);
      let valid = true;
      for (const claim of claims) {
        const record = records.find(record => record.id === claim.id);
        if (!record || !validSmsRecord(record, claim, now)) valid = false;
        if (record && !record.consumedAt && record.expiresAt > now && record.attempts < 5)
          await tx.$executeRaw`UPDATE "SmsVerification" SET "attempts" = "attempts" + 1 WHERE "id" = ${record.id}`;
      }
      // Returning false commits failed-attempt counts; throwing here would roll them back.
      if (!valid) return false;
      await tx.$executeRaw(Prisma.sql`UPDATE "SmsVerification" SET "consumedAt" = ${timestamp(now)}::timestamp WHERE "id" IN (${Prisma.join(claims.map(claim => claim.id))})`);
      return true;
    });
  },
};
