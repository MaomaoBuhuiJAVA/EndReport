import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGameRepository, type GameDatabase, type GameQuery } from "./server-repository";
import { explorerStats } from "./progress";

// PostgreSQL runs entirely in process. These tests never read DATABASE_URL,
// open a network connection, or apply the patch to the site's database.
const db = new PGlite();
const query: GameQuery = async <T extends Record<string, unknown>>(text: string, values: unknown[] = []) => (await db.query<T>(text, values)).rows;
const database: GameDatabase = {
  query,
  transaction: work => db.transaction(async transaction => work(async <T extends Record<string, unknown>>(text: string, values: unknown[] = []) => (await transaction.query<T>(text, values)).rows)),
};
let clock = new Date("2026-10-22T04:00:00Z");
let sequence = 0;
const repository = createGameRepository(database, { now: () => new Date(clock), id: () => `test-${++sequence}` });

beforeAll(async () => {
  await db.exec('CREATE TABLE "User" ("id" TEXT PRIMARY KEY);');
  const patch = await readFile(new URL("../../../prisma/patches/science-games.sql", import.meta.url), "utf8");
  await db.exec(patch);
  await db.exec(patch);
}, 60_000);

beforeEach(async () => {
  // The parent FK's cascade clears only this isolated test database.
  await db.exec('TRUNCATE TABLE "User" CASCADE; INSERT INTO "User" ("id") VALUES (\'owner-a\'), (\'owner-b\');');
  clock = new Date("2026-10-22T04:00:00Z");
  sequence = 0;
});

afterAll(async () => { await db.close(); });

const child = (owner = "owner-a", name = "小星", age: "小班" | "中班" | "大班" = "中班") => repository.createProfile(owner, { name, age, avatar: "planet" });
const finish = (ownerId: string, profileId: string, gameId = "magnet", eventId = `event-${++sequence}`) => repository.complete(ownerId, { profileId, gameId, eventId });

describe("science games repository against PostgreSQL", () => {
  it("creates and edits children independently for two authenticated owners", async () => {
    const first = await child("owner-a", "芽芽", "小班");
    const second = await child("owner-b", "云云", "大班");
    expect(first.profile.id).not.toBe(second.profile.id);
    expect((await repository.getProgress("owner-a")).profiles).toEqual([first.profile]);
    expect((await repository.getProgress("owner-b")).profiles).toEqual([second.profile]);
    const changed = await repository.updateProfile("owner-a", first.profile.id, { name: "新昵称", age: "中班", avatar: "cloud" });
    expect(changed.profile).toMatchObject({ id: first.profile.id, name: "新昵称", age: "中班", avatar: "cloud" });
    expect((await repository.getProgress("owner-b")).profiles).toEqual([second.profile]);
    await expect(repository.updateProfile("owner-b", first.profile.id, { name: "越权修改", age: "大班", avatar: "seed" })).rejects.toThrow();
    await expect(finish("owner-b", first.profile.id)).rejects.toThrow();
    expect((await repository.getProgress("owner-a")).completions).toHaveLength(0);
  });

  it("takes reward value, completion time and ownership from the server", async () => {
    const created = await child();
    const body = { profileId: created.profile.id, gameId: "magnet", eventId: "untrusted-fields", points: 999999, completedAt: "2099-01-01T00:00:00Z", day: "2099-01-01", ownerId: "owner-b" };
    const result = await repository.complete("owner-a", body);
    expect(result.points).toBe(10);
    expect(result.progress.completions).toHaveLength(1);
    expect(result.progress.completions[0]).toMatchObject({ profileId: created.profile.id, gameId: "magnet", points: 10 });
    expect(new Date(result.progress.completions[0].completedAt).getTime()).toBe(clock.getTime());
    expect((await repository.getProgress("owner-b")).completions).toHaveLength(0);
  });

  it("awards only once per game/day across concurrent requests and new event IDs", async () => {
    const created = await child();
    // PGlite serializes transactions on its one PostgreSQL connection. This
    // checks overlapping callers and persisted uniqueness, not multi-connection
    // lock scheduling on a deployed PostgreSQL server.
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => finish("owner-a", created.profile.id, "magnet", `concurrent-${index}`)));
    expect(results.reduce((total, result) => total + result.points, 0)).toBe(10);
    const saved = await repository.getProgress("owner-a");
    expect(saved.completions).toHaveLength(1);
    expect(explorerStats(saved, created.profile.id, clock).totalPoints).toBe(10);
  });

  it("keeps a single persisted result for concurrent retries of one event", async () => {
    const created = await child();
    const results = await Promise.all(Array.from({ length: 5 }, () => finish("owner-a", created.profile.id, "shadow", "one-event")));
    for (const result of results) {
      expect(result.points).toBe(10);
      expect(result.progress.completions).toHaveLength(1);
    }
    const events = await db.query('SELECT "eventId", "points" FROM "ScienceGameEvent" WHERE "ownerId" = $1', ["owner-a"]);
    expect(events.rows).toEqual([{ eventId: "one-event", points: 10 }]);
    expect((await repository.getProgress("owner-a")).completions).toHaveLength(1);
  });

  it("enforces unique daily awards and matching child ownership in PostgreSQL constraints", async () => {
    const first = await child();
    const result = await finish("owner-a", first.profile.id, "magnet", "constraint-original");
    const stored = result.progress.completions[0];
    const insert = 'INSERT INTO "ScienceGameCompletion" ("id", "ownerId", "profileId", "gameId", "day", "completedAt", "points") VALUES ($1,$2,$3,$4,$5::date,$6,$7)';
    await expect(db.query(insert, ["duplicate", "owner-a", first.profile.id, "magnet", "2026-10-22", clock, 10])).rejects.toMatchObject({ code: "23505" });
    await expect(db.query(insert, ["wrong-owner", "owner-b", first.profile.id, "water", "2026-10-22", clock, 10])).rejects.toMatchObject({ code: "23503" });
    await expect(db.query(insert, ["inflated", "owner-a", first.profile.id, "water", "2026-10-22", clock, 99999])).rejects.toMatchObject({ code: "23514" });
    await expect(db.query('INSERT INTO "ScienceGameEvent" ("ownerId","eventId","profileId","gameId","completionId","points") VALUES ($1,$2,$3,$4,$5,$6)', ["owner-a", "constraint-original", first.profile.id, "magnet", stored.id, 10])).rejects.toMatchObject({ code: "23505" });
    expect((await repository.getProgress("owner-a")).completions).toHaveLength(1);
  });

  it("rolls back the completion if recording its idempotency event fails", async () => {
    const created = await child();
    const failing = createGameRepository({
      query,
      transaction: work => database.transaction(transactionQuery => work(async <T extends Record<string, unknown>>(text: string, values?: unknown[]) => {
        if (/INSERT INTO "ScienceGameEvent"/u.test(text)) throw new Error("Simulated event insert failure");
        return transactionQuery<T>(text, values);
      })),
    }, { now: () => new Date(clock), id: () => `rollback-${++sequence}` });
    await expect(failing.complete("owner-a", { profileId: created.profile.id, gameId: "magnet", eventId: "rollback-event" })).rejects.toThrow("Simulated event insert failure");
    expect((await repository.getProgress("owner-a")).completions).toHaveLength(0);
    expect((await finish("owner-a", created.profile.id, "magnet", "rollback-event")).points).toBe(10);
  });

  it("persists SQL-like nicknames as text and ignores injected owner fields", async () => {
    const literal = "x');--";
    const created = await repository.createProfile("owner-a", { name: literal, age: "小班", avatar: "seed", ownerId: "owner-b", id: "forged-id", points: 999 });
    expect(created.profile.name).toBe(literal);
    expect(created.profile.id).not.toBe("forged-id");
    expect((await repository.getProgress("owner-b")).profiles).toHaveLength(0);
    expect((await repository.getProgress("owner-a")).profiles).toEqual([created.profile]);
    expect((await db.query('SELECT COUNT(*) AS count FROM "User"')).rows).toEqual([{ count: 2 }]);
    expect(Object.keys(created.profile).sort()).toEqual(["age", "avatar", "id", "name"]);
  });

  it("does not turn an already used completion event into another reward after China midnight", async () => {
    const created = await child();
    clock = new Date("2026-10-22T15:59:59Z");
    await finish("owner-a", created.profile.id, "magnet", "original-event");
    await finish("owner-a", created.profile.id, "magnet", "same-day-zero-event");
    clock = new Date("2026-10-22T16:00:00Z");
    await finish("owner-a", created.profile.id, "magnet", "original-event");
    await finish("owner-a", created.profile.id, "magnet", "same-day-zero-event");
    const beforeNew = await repository.getProgress("owner-a");
    expect(beforeNew.completions).toHaveLength(1);
    expect(explorerStats(beforeNew, created.profile.id, clock)).toMatchObject({ todayPoints: 0, totalPoints: 10 });
    const newDay = await finish("owner-a", created.profile.id, "magnet", "new-day-event");
    expect(newDay.points).toBe(10);
    expect(newDay.progress.completions).toHaveLength(2);
    expect(explorerStats(newDay.progress, created.profile.id, clock)).toMatchObject({ todayPoints: 10, totalPoints: 20 });
  });

  it("binds event IDs to the original child and game while isolating other owners", async () => {
    const first = await child();
    const sibling = await child("owner-a", "弟弟");
    const anotherOwner = await child("owner-b", "云云");
    await finish("owner-a", first.profile.id, "magnet", "shared-event");
    await expect(finish("owner-a", sibling.profile.id, "magnet", "shared-event")).rejects.toThrow();
    await expect(finish("owner-a", first.profile.id, "water", "shared-event")).rejects.toThrow();
    expect((await finish("owner-b", anotherOwner.profile.id, "magnet", "shared-event")).points).toBe(10);
    const saved = await repository.getProgress("owner-a");
    expect(saved.completions).toHaveLength(1);
    expect(saved.completions[0].profileId).toBe(first.profile.id);
  });

  it("awards all three hands-on games and caps a child's day at 30 points", async () => {
    const first = await child();
    const results = await Promise.all(["magnet", "water", "shadow"].map(gameId => finish("owner-a", first.profile.id, gameId)));
    expect(results.map(result => result.points)).toEqual([10, 10, 10]);
    for (const gameId of ["magnet", "water", "shadow"]) expect((await finish("owner-a", first.profile.id, gameId)).points).toBe(0);
    const saved = await repository.getProgress("owner-a");
    expect(saved.completions).toHaveLength(3);
    expect(explorerStats(saved, first.profile.id, clock)).toMatchObject({ todayPoints: 30, totalPoints: 30, topics: 3 });
    const second = await child("owner-a", "弟弟");
    expect((await finish("owner-a", second.profile.id, "magnet")).points).toBe(10);
  });

  it("rejects invalid profiles and unavailable games without committing partial rewards", async () => {
    const first = await child();
    for (const input of [{ name: " ", age: "中班", avatar: "planet" }, { name: "a\nadmin", age: "中班", avatar: "planet" }, { name: "a".repeat(13), age: "中班", avatar: "planet" }, { name: "小星", age: "成人", avatar: "planet" }, { name: "小星", age: "中班", avatar: "https://foreign.invalid/avatar.svg" }]) {
      expect(() => repository.createProfile("owner-a", input)).toThrow();
    }
    expect(() => finish("owner-a", first.profile.id, "growth")).toThrow();
    expect(() => finish("owner-a", first.profile.id, "not-a-game")).toThrow();
    const saved = await repository.getProgress("owner-a");
    expect(saved.profiles).toHaveLength(1);
    expect(saved.completions).toHaveLength(0);
  });

  it("ranks the shared weekly board by age, gives ties the same rank, and exposes only public child fields", async () => {
    const leader = await child("owner-a", "甲", "中班");
    const tiedA = await child("owner-a", "乙", "中班");
    const tiedB = await child("owner-b", "丙", "中班");
    const younger = await child("owner-b", "小小", "小班");
    await finish("owner-a", leader.profile.id, "magnet");
    await finish("owner-a", leader.profile.id, "water");
    await finish("owner-a", tiedA.profile.id, "magnet");
    await finish("owner-b", tiedB.profile.id, "shadow");
    await finish("owner-b", younger.profile.id, "magnet");
    const board = await repository.leaderboard("中班");
    expect(board).toMatchObject({ weekStart: "2026-10-19", weekEnd: "2026-10-26" });
    expect(board.rows).toHaveLength(3);
    expect(board.rows[0]).toMatchObject({ id: leader.profile.id, rank: 1, weekPoints: 20, topics: 2 });
    expect(board.rows.slice(1).map(row => ({ rank: row.rank, points: row.weekPoints }))).toEqual([{ rank: 2, points: 10 }, { rank: 2, points: 10 }]);
    expect(new Set(board.rows.map(row => row.id))).toEqual(new Set([leader.profile.id, tiedA.profile.id, tiedB.profile.id]));
    for (const row of board.rows) expect(Object.keys(row).sort()).toEqual(["age", "avatar", "id", "name", "rank", "topics", "weekPoints"]);
    expect((await repository.leaderboard("小班")).rows.map(row => row.id)).toEqual([younger.profile.id]);
  });

  it("resets the board exactly at Monday midnight in China while retaining lifetime records", async () => {
    const first = await child();
    clock = new Date("2026-10-25T15:59:59Z");
    await finish("owner-a", first.profile.id, "magnet");
    expect(await repository.leaderboard("中班")).toMatchObject({ weekStart: "2026-10-19", weekEnd: "2026-10-26", rows: [{ weekPoints: 10 }] });
    clock = new Date("2026-10-25T16:00:00Z");
    expect(await repository.leaderboard("中班")).toMatchObject({ weekStart: "2026-10-26", weekEnd: "2026-11-02", rows: [] });
    const carried = await repository.getProgress("owner-a");
    expect(explorerStats(carried, first.profile.id, clock)).toMatchObject({ weekPoints: 0, totalPoints: 10 });
    await finish("owner-a", first.profile.id, "magnet");
    expect(await repository.leaderboard("中班")).toMatchObject({ rows: [{ weekPoints: 10 }] });
    const completed = await repository.getProgress("owner-a");
    expect(explorerStats(completed, first.profile.id, clock)).toMatchObject({ weekPoints: 10, totalPoints: 20 });
  });
});
