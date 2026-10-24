import { AGE_GROUPS, COMPLETION_POINTS, DAILY_POINT_LIMIT, SCIENCE_GAMES, type AgeGroup, type GameId } from "./catalog";

export type ExplorerProfile = { id: string; name: string; age: AgeGroup; avatar: "seed" | "planet" | "cloud" };
export type GameCompletion = { id: string; profileId: string; gameId: GameId; completedAt: string; points: number };
export type GameProgress = { version: 1; activeProfileId: string; profiles: ExplorerProfile[]; completions: GameCompletion[] };

export function emptyProgress(): GameProgress {
  return { version: 1, activeProfileId: "first-explorer", profiles: [{ id: "first-explorer", name: "小小探索家", age: "中班", avatar: "planet" }], completions: [] };
}

/** All rewards and week boundaries use the same China calendar as the site. */
export function chinaDay(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function chinaWeek(date: Date): string {
  const local = new Date(`${chinaDay(date)}T00:00:00Z`);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}

export function parseProgress(raw: string | null): GameProgress {
  if (!raw) return emptyProgress();
  try {
    const value = JSON.parse(raw) as GameProgress;
    if (value.version !== 1 || !Array.isArray(value.profiles) || !Array.isArray(value.completions)) return emptyProgress();
    const ids = new Set<string>();
    const profiles = value.profiles.filter(profile => {
      if (!profile || typeof profile.id !== "string" || ids.has(profile.id) || typeof profile.name !== "string" || !profile.name.trim() || profile.name.length > 12 || !AGE_GROUPS.includes(profile.age) || !["seed", "planet", "cloud"].includes(profile.avatar)) return false;
      ids.add(profile.id);
      return true;
    });
    if (!profiles.length) return emptyProgress();
    const seen = new Set<string>();
    const totals = new Map<string, number>();
    const completions = value.completions.filter(completion => {
      if (!completion || typeof completion.id !== "string" || !ids.has(completion.profileId) || !SCIENCE_GAMES.some(game => game.id === completion.gameId) || !Number.isFinite(Date.parse(completion.completedAt)) || ![0, COMPLETION_POINTS].includes(completion.points)) return false;
      const day = chinaDay(new Date(completion.completedAt));
      const key = `${completion.profileId}:${day}:${completion.gameId}`;
      const totalKey = `${completion.profileId}:${day}`;
      const total = (totals.get(totalKey) ?? 0) + completion.points;
      if (seen.has(key) || total > DAILY_POINT_LIMIT) return false;
      seen.add(key);
      totals.set(totalKey, total);
      return true;
    });
    return { version: 1, profiles, completions, activeProfileId: ids.has(value.activeProfileId) ? value.activeProfileId : profiles[0].id };
  } catch {
    return emptyProgress();
  }
}

export function explorerStats(progress: GameProgress, profileId: string, now = new Date()) {
  const records = progress.completions.filter(record => record.profileId === profileId);
  return {
    totalPoints: records.reduce((sum, record) => sum + record.points, 0),
    weekPoints: records.filter(record => chinaWeek(new Date(record.completedAt)) === chinaWeek(now)).reduce((sum, record) => sum + record.points, 0),
    todayPoints: records.filter(record => chinaDay(new Date(record.completedAt)) === chinaDay(now)).reduce((sum, record) => sum + record.points, 0),
    topics: new Set(records.map(record => record.gameId)).size,
    completedToday: records.filter(record => chinaDay(new Date(record.completedAt)) === chinaDay(now)).map(record => record.gameId),
  };
}

export function completeGame(progress: GameProgress, profileId: string, gameId: GameId, now = new Date()) {
  if (!progress.profiles.some(profile => profile.id === profileId) || !SCIENCE_GAMES.some(game => game.id === gameId && game.available)) throw new Error("探索任务暂不可用");
  const stats = explorerStats(progress, profileId, now);
  if (stats.completedToday.includes(gameId)) return { progress, points: 0, reason: "今天已经获得过这个游戏的积分啦。" };
  const points = Math.min(COMPLETION_POINTS, DAILY_POINT_LIMIT - stats.todayPoints);
  const completion: GameCompletion = { id: `${profileId}:${gameId}:${chinaDay(now)}`, profileId, gameId, completedAt: now.toISOString(), points };
  return {
    progress: { ...progress, completions: [...progress.completions, completion] },
    points,
    reason: points ? "完成探索，收获新的科学发现！" : "今天的积分已经集齐，探索的快乐还在继续。",
  };
}

export function leaderboard(progress: GameProgress, age: AgeGroup, now = new Date()) {
  const rows = progress.profiles.filter(profile => profile.age === age).map(profile => ({ ...profile, ...explorerStats(progress, profile.id, now) })).sort((a, b) => b.weekPoints - a.weekPoints || a.name.localeCompare(b.name, "zh-CN"));
  let rank = 0;
  return rows.map((row, index) => {
    if (!index || row.weekPoints !== rows[index - 1].weekPoints) rank = index + 1;
    return { ...row, rank };
  });
}
