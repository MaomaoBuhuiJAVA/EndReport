import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("@/lib/prisma", () => ({prisma: {$transaction: vi.fn(), $executeRaw: vi.fn()}}));
import {prisma} from "@/lib/prisma";
import {postgresSmsStore} from "./store";
import type {SmsRecord} from "./service";
const at = new Date("2026-10-10T00:00:00Z");
const record: SmsRecord = {id: "11111111-1111-4111-8111-111111111111", phone: "13800138000", purpose: "login", principal: "", codeHash: "a".repeat(64), senderKey: "b".repeat(64), createdAt: at, expiresAt: new Date(at.getTime() + 300000), attempts: 0, consumedAt: null, deliveredAt: at};
const counts = {lastPhone: null, phoneHour: BigInt(0), phoneDay: BigInt(0), senderHour: BigInt(0), senderDay: BigInt(0), total: BigInt(0)};
const tx = {$queryRaw: vi.fn(), $executeRaw: vi.fn()};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (callback: (value: typeof tx) => unknown) => callback(tx)) as never);
});
describe("persistent SMS reservations", () => {
  it("uses a shared lock without deserializing PostgreSQL void and reserves before delivery", async () => {
    tx.$queryRaw.mockResolvedValueOnce([counts]); await expect(postgresSmsStore.reserve(record)).resolves.toBeNull();
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toContain("pg_advisory_xact_lock");
    expect(tx.$executeRaw.mock.calls[2][0].join("")).toContain("INSERT INTO");
  });
  it.each([
    [{...counts, lastPhone: new Date(at.getTime() - 20000)}, 40],
    [{...counts, phoneHour: BigInt(5)}, 3600],
    [{...counts, senderHour: BigInt(20)}, 3600],
    [{...counts, phoneDay: BigInt(20)}, 86400],
    [{...counts, senderDay: BigInt(60)}, 86400],
    [{...counts, total: BigInt(500)}, 86400],
  ])("does not reserve another SMS when a shared quota is reached", async (count, retry) => {
    tx.$queryRaw.mockResolvedValueOnce([count]); await expect(postgresSmsStore.reserve(record)).resolves.toBe(retry);
    expect(tx.$executeRaw.mock.calls.some(call => call[0].join("").includes("INSERT INTO"))).toBe(false);
  });
});
describe("transactional SMS consumption", () => {
  const claim = {id: record.id, phone: record.phone, purpose: record.purpose, principal: "", codeHash: record.codeHash};
  it("commits a failed guess without consuming the code or throwing a rollback", async () => {
    tx.$queryRaw.mockResolvedValueOnce([record]);
    await expect(postgresSmsStore.consume([{...claim, codeHash: "c".repeat(64)}], at)).resolves.toBe(false);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toContain('"attempts" = "attempts" + 1');
  });
  it("does not consume either phone proof if one code is invalid", async () => {
    const next = {...record, id: "22222222-2222-4222-8222-222222222222", phone: "13900139000", purpose: "phone_new" as const};
    tx.$queryRaw.mockResolvedValueOnce([record, next]);
    expect(await postgresSmsStore.consume([claim, {...claim, id: next.id, phone: next.phone, purpose: next.purpose, codeHash: "c".repeat(64)}], at)).toBe(false);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.calls[0][0].sql).toContain('ORDER BY "id" FOR UPDATE');
  });
  it("marks all valid proofs consumed within their locking transaction", async () => {
    tx.$queryRaw.mockResolvedValueOnce([record]); expect(await postgresSmsStore.consume([claim], at)).toBe(true);
    expect(tx.$executeRaw.mock.calls[1][0].sql).toContain('SET "consumedAt" =');
  });
});
