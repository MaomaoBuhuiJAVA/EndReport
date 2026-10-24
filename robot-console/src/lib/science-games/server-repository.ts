import { randomUUID } from "node:crypto";
import { AGE_GROUPS, COMPLETION_POINTS, DAILY_POINT_LIMIT, SCIENCE_GAMES, type AgeGroup, type GameId } from "./catalog";
import { chinaDay, chinaWeek, type ExplorerProfile, type GameProgress } from "./progress";

export type GameQuery = <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>;
export type GameDatabase = { query: GameQuery; transaction<T>(work: (query: GameQuery) => Promise<T>): Promise<T> };
export class GameServerError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type GameProfileInput = Pick<ExplorerProfile, "name" | "age" | "avatar">;
type ProfileRow = ExplorerProfile & Record<string, unknown>;
type CompletionRow = { id: string; profileId: string; gameId: GameId; completedAt: Date | string; points: number } & Record<string, unknown>;
type EventRow = { profileId: string; gameId: string; points: number } & Record<string, unknown>;
export type GameLeaderboardRow = ExplorerProfile & { weekPoints: number; topics: number; rank: number };

export function gameProfileInput(input: unknown): GameProfileInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GameServerError("请填写完整的孩子档案。");
  const value = input as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name || name.length > 12 || /[\u0000-\u001f\u007f]/u.test(name)) throw new GameServerError("昵称需为 1 至 12 个字，不能包含控制字符。");
  if (!AGE_GROUPS.includes(value.age as AgeGroup)) throw new GameServerError("请选择有效的年龄段。");
  if (!["seed", "planet", "cloud"].includes(value.avatar as string)) throw new GameServerError("请选择有效的头像。");
  return { name, age: value.age as AgeGroup, avatar: value.avatar as ExplorerProfile["avatar"] };
}

export function gameAge(value: unknown): AgeGroup {
  if (!AGE_GROUPS.includes(value as AgeGroup)) throw new GameServerError("请选择有效的年龄段。");
  return value as AgeGroup;
}

function identifier(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/u.test(value)) throw new GameServerError(`${label}无效。`);
  return value;
}

export function gameCompletionInput(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new GameServerError("完成记录格式无效。");
  const value = input as Record<string, unknown>;
  const profileId = identifier(value.profileId, "孩子档案");
  const eventId = identifier(value.eventId, "完成事件");
  if (!SCIENCE_GAMES.some(game => game.id === value.gameId && game.available)) throw new GameServerError("这个游戏暂未开放。");
  return { profileId, eventId, gameId: value.gameId as GameId };
}

const rewarded = "完成探索，获得 10 积分。";
const repeated = "今天已经获得过这个游戏的积分啦。";

export function createGameRepository(db: GameDatabase, options: { now?: () => Date; id?: () => string } = {}) {
  const now = options.now ?? (() => new Date());
  const id = options.id ?? randomUUID;

  async function ownerLock(query: GameQuery, ownerId: string) {
    // Serialize writes for one account. Different accounts remain independent.
    const rows = await query('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', [ownerId]);
    if (!rows.length) throw new GameServerError("请重新登录后再试。", 401);
  }

  async function progress(query: GameQuery, ownerId: string, activeProfileId?: string): Promise<GameProgress> {
    const profiles = await query<ProfileRow>('SELECT "id", "name", "age", "avatar" FROM "ScienceGameProfile" WHERE "ownerId" = $1 ORDER BY "createdAt", "id"', [ownerId]);
    const completions = await query<CompletionRow>(`SELECT c."id", c."profileId", c."gameId", c."completedAt", c."points"
      FROM "ScienceGameCompletion" c JOIN "ScienceGameProfile" p ON p."id" = c."profileId" AND p."ownerId" = c."ownerId"
      WHERE p."ownerId" = $1 ORDER BY c."completedAt", c."id"`, [ownerId]);
    return {
      version: 1,
      profiles: profiles.map(profile => ({ id: profile.id, name: profile.name, age: profile.age, avatar: profile.avatar })),
      activeProfileId: activeProfileId && profiles.some(profile => profile.id === activeProfileId) ? activeProfileId : profiles[0]?.id ?? "",
      completions: completions.map(record => ({ id: record.id, profileId: record.profileId, gameId: record.gameId, completedAt: new Date(record.completedAt).toISOString(), points: Number(record.points) })),
    };
  }

  return {
    getProgress(ownerId: string) { return db.transaction(query => progress(query, ownerId)); },
    createProfile(ownerId: string, input: unknown) {
      const value = gameProfileInput(input);
      return db.transaction(async query => {
        await ownerLock(query, ownerId);
        const rows = await query<ProfileRow>(`INSERT INTO "ScienceGameProfile" ("id", "ownerId", "name", "age", "avatar", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING "id", "name", "age", "avatar"`, [id(), ownerId, value.name, value.age, value.avatar, now()]);
        const profile: ExplorerProfile = { id: rows[0].id, name: rows[0].name, age: rows[0].age, avatar: rows[0].avatar };
        return { profile, progress: await progress(query, ownerId, profile.id) };
      });
    },
    updateProfile(ownerId: string, profileId: string, input: unknown) {
      identifier(profileId, "孩子档案");
      const value = gameProfileInput(input);
      return db.transaction(async query => {
        await ownerLock(query, ownerId);
        const rows = await query<ProfileRow>(`UPDATE "ScienceGameProfile" SET "name" = $3, "age" = $4, "avatar" = $5, "updatedAt" = $6
          WHERE "id" = $1 AND "ownerId" = $2 RETURNING "id", "name", "age", "avatar"`, [profileId, ownerId, value.name, value.age, value.avatar, now()]);
        if (!rows.length) throw new GameServerError("没有找到这个孩子档案。", 404);
        const profile: ExplorerProfile = { id: rows[0].id, name: rows[0].name, age: rows[0].age, avatar: rows[0].avatar };
        return { profile, progress: await progress(query, ownerId, profileId) };
      });
    },
    complete(ownerId: string, input: unknown) {
      const value = gameCompletionInput(input);
      // The receipt time belongs to the server, never the client clock/body.
      const receivedAt = now();
      const day = chinaDay(receivedAt);
      return db.transaction(async query => {
        await ownerLock(query, ownerId);
        const profiles = await query('SELECT "id" FROM "ScienceGameProfile" WHERE "id" = $1 AND "ownerId" = $2 FOR UPDATE', [value.profileId, ownerId]);
        if (!profiles.length) throw new GameServerError("没有找到这个孩子档案。", 404);
        const previous = await query<EventRow>('SELECT "profileId", "gameId", "points" FROM "ScienceGameEvent" WHERE "ownerId" = $1 AND "eventId" = $2', [ownerId, value.eventId]);
        if (previous.length) {
          if (previous[0].profileId !== value.profileId || previous[0].gameId !== value.gameId) throw new GameServerError("这个完成事件已经用于另一个游戏或孩子。");
          const points = Number(previous[0].points);
          return { progress: await progress(query, ownerId, value.profileId), points, reason: points ? rewarded : repeated };
        }
        const existing = await query<{ id: string } & Record<string, unknown>>('SELECT "id" FROM "ScienceGameCompletion" WHERE "profileId" = $1 AND "gameId" = $2 AND "day" = $3::date', [value.profileId, value.gameId, day]);
        let completionId = existing[0]?.id;
        let points = 0;
        if (!completionId) {
          const totals = await query<{ total: string | number } & Record<string, unknown>>('SELECT COALESCE(SUM("points"), 0) AS "total" FROM "ScienceGameCompletion" WHERE "profileId" = $1 AND "day" = $2::date', [value.profileId, day]);
          points = Math.max(0, Math.min(COMPLETION_POINTS, DAILY_POINT_LIMIT - Number(totals[0].total)));
          completionId = id();
          await query(`INSERT INTO "ScienceGameCompletion" ("id", "ownerId", "profileId", "gameId", "day", "completedAt", "points")
            VALUES ($1, $2, $3, $4, $5::date, $6, $7)`, [completionId, ownerId, value.profileId, value.gameId, day, receivedAt, points]);
        }
        // Remember even a zero-point duplicate so a retry tomorrow cannot gain points.
        await query(`INSERT INTO "ScienceGameEvent" ("ownerId", "eventId", "profileId", "gameId", "completionId", "points", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [ownerId, value.eventId, value.profileId, value.gameId, completionId, points, receivedAt]);
        return { progress: await progress(query, ownerId, value.profileId), points, reason: points ? rewarded : repeated };
      });
    },
    async leaderboard(age: unknown) {
      const validAge = gameAge(age);
      const weekStart = chinaWeek(now());
      const end = new Date(`${weekStart}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 7);
      const weekEnd = end.toISOString().slice(0, 10);
      const rows = await db.query<ProfileRow & { weekPoints: string | number; topics: string | number; rank: string | number }>(`WITH scores AS (
        SELECT p."id", p."name", p."age", p."avatar", SUM(c."points") AS "weekPoints", COUNT(DISTINCT c."gameId") AS "topics"
        FROM "ScienceGameProfile" p JOIN "ScienceGameCompletion" c ON c."profileId" = p."id" AND c."ownerId" = p."ownerId"
        WHERE p."age" = $1 AND c."day" >= $2::date AND c."day" < $3::date
        GROUP BY p."id", p."name", p."age", p."avatar" HAVING SUM(c."points") > 0
      ) SELECT *, RANK() OVER (ORDER BY "weekPoints" DESC) AS "rank" FROM scores
      ORDER BY "weekPoints" DESC, "name", "id"`, [validAge, weekStart, weekEnd]);
      return { rows: rows.map(row => ({ id: row.id, name: row.name, age: row.age, avatar: row.avatar, weekPoints: Number(row.weekPoints), topics: Number(row.topics), rank: Number(row.rank) }) satisfies GameLeaderboardRow), weekStart, weekEnd };
    },
  };
}
