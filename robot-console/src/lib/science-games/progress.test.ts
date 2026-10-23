import { describe, expect, it } from "vitest";
import { chinaDay, chinaWeek, completeGame, emptyProgress, explorerStats, leaderboard, parseProgress } from "./progress";

describe("science game exploration rewards", () => {
  it("awards once per game per China calendar day and survives serialization", () => {
    const first = completeGame(emptyProgress(), "first-explorer", "magnet", new Date("2026-10-22T15:59:00Z"));
    expect(first.points).toBe(10);
    const restored = parseProgress(JSON.stringify(first.progress));
    expect(completeGame(restored, "first-explorer", "magnet", new Date("2026-10-22T15:59:59Z")).points).toBe(0);
    const nextDay = completeGame(restored, "first-explorer", "magnet", new Date("2026-10-22T16:00:00Z"));
    expect(nextDay.points).toBe(10);
    expect(explorerStats(nextDay.progress, "first-explorer", new Date("2026-10-22T16:00:00Z"))).toMatchObject({ todayPoints: 10, totalPoints: 20 });
  });

  it("uses Monday midnight in China for the weekly reset", () => {
    expect(chinaDay(new Date("2026-10-25T16:00:00Z"))).toBe("2026-10-26");
    expect(chinaWeek(new Date("2026-10-25T15:59:59Z"))).toBe("2026-10-19");
    expect(chinaWeek(new Date("2026-10-25T16:00:00Z"))).toBe("2026-10-26");
    const { progress } = completeGame(emptyProgress(), "first-explorer", "magnet", new Date("2026-10-25T15:59:59Z"));
    expect(explorerStats(progress, "first-explorer", new Date("2026-10-25T16:00:00Z"))).toMatchObject({ weekPoints: 0, totalPoints: 10 });
  });

  it("awards water independently from magnet and only once per China calendar day", () => {
    const now = new Date("2026-10-22T04:00:00Z");
    const magnet = completeGame(emptyProgress(), "first-explorer", "magnet", now);
    const water = completeGame(magnet.progress, "first-explorer", "water", now);
    expect(water.points).toBe(10);
    expect(explorerStats(water.progress, "first-explorer", now)).toMatchObject({ todayPoints: 20, totalPoints: 20, topics: 2, completedToday: ["magnet", "water"] });
    const restored = parseProgress(JSON.stringify(water.progress));
    expect(completeGame(restored, "first-explorer", "water", now).points).toBe(0);
    expect(completeGame(restored, "first-explorer", "magnet", now).points).toBe(0);
    expect(restored.completions).toHaveLength(2);
    const nextDay = completeGame(restored, "first-explorer", "water", new Date("2026-10-22T16:00:00Z"));
    expect(nextDay.points).toBe(10);
    expect(explorerStats(nextDay.progress, "first-explorer", new Date("2026-10-22T16:00:00Z"))).toMatchObject({ todayPoints: 10, totalPoints: 30 });
  });

  it("keeps profiles independent, separates ages and gives ties the same rank", () => {
    const now = new Date("2026-10-22T04:00:00Z");
    const progress = emptyProgress();
    progress.profiles.push({ id: "second", name: "芽芽", age: "中班", avatar: "seed" }, { id: "third", name: "云云", age: "小班", avatar: "cloud" });
    const { progress: rewarded } = completeGame(progress, "first-explorer", "magnet", now);
    expect(leaderboard(rewarded, "中班", now).map(row => [row.id, row.rank, row.weekPoints])).toEqual([["first-explorer", 1, 10], ["second", 2, 0]]);
    const { progress: tied } = completeGame(rewarded, "second", "magnet", now);
    expect(leaderboard(tied, "中班", now).map(row => row.rank)).toEqual([1, 1]);
    expect(leaderboard(tied, "小班", now)).toHaveLength(1);
  });

  it("awards all three hands-on games once and keeps the daily total at 30 points", () => {
    const now = new Date("2026-10-22T04:00:00Z");
    let progress = emptyProgress();
    for (const gameId of ["magnet", "water", "shadow"] as const) {
      const result = completeGame(progress, "first-explorer", gameId, now);
      expect(result.points).toBe(10);
      progress = result.progress;
    }
    const restored = parseProgress(JSON.stringify(progress));
    expect(explorerStats(restored, "first-explorer", now)).toMatchObject({ todayPoints: 30, totalPoints: 30, topics: 3 });
    for (const gameId of ["magnet", "water", "shadow"] as const) {
      expect(completeGame(restored, "first-explorer", gameId, now).points).toBe(0);
    }
    expect(restored.completions).toHaveLength(3);
    expect(completeGame(restored, "first-explorer", "shadow", new Date("2026-10-22T16:00:00Z")).points).toBe(10);
  });

  it("recovers corrupt storage and filters duplicate or invalid reward records", () => {
    expect(parseProgress("not json")).toEqual(emptyProgress());
    const { progress } = completeGame(emptyProgress(), "first-explorer", "magnet", new Date("2026-10-22T04:00:00Z"));
    progress.completions.push(progress.completions[0], { ...progress.completions[0], id: "invalid", points: 999 });
    expect(parseProgress(JSON.stringify(progress)).completions).toHaveLength(1);
    expect(() => completeGame(emptyProgress(), "missing", "magnet")).toThrow();
    expect(() => completeGame(emptyProgress(), "first-explorer", "growth")).toThrow();
  });
});
