import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("./server-db", () => ({ getGameRepository: vi.fn() }));

import { getSessionUser } from "@/lib/auth";
import { getGameRepository } from "./server-db";
import { GameServerError, gameCompletionInput, gameProfileInput } from "./server-repository";
import { GET as getProgress } from "../../../app/api/games/progress/route";
import { POST as createProfile } from "../../../app/api/games/profiles/route";
import { PATCH as updateProfile } from "../../../app/api/games/profiles/[profileId]/route";
import { POST as complete } from "../../../app/api/games/completions/route";
import { GET as board } from "../../../app/api/games/leaderboard/route";

const profile = { id: "child-a", name: "芽芽", age: "中班", avatar: "seed" };
const progress = { version: 1, activeProfileId: "child-a", profiles: [profile], completions: [] };
const repository = {
  getProgress: vi.fn(), createProfile: vi.fn(), updateProfile: vi.fn(), complete: vi.fn(), leaderboard: vi.fn(),
};
const user = { id: "owner-a", name: "家长", role: "USER" as const };

function request(path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(`https://school.example/api/games/${path}`, { method, headers: { "content-type": "application/json", origin: "https://school.example", ...headers }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(user);
  vi.mocked(getGameRepository).mockReturnValue(repository as never);
  repository.getProgress.mockResolvedValue(progress);
  repository.createProfile.mockResolvedValue({ profile, progress });
  repository.updateProfile.mockResolvedValue({ profile, progress });
  repository.complete.mockResolvedValue({ progress, points: 10, reason: "完成探索" });
  repository.leaderboard.mockResolvedValue({ rows: [{ ...profile, weekPoints: 10, topics: 1, rank: 1 }], weekStart: "2026-10-19", weekEnd: "2026-10-26" });
});

describe("science game server routes", () => {
  it("requires real sessions and never falls back to the anonymous public actor", async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);
    const unauthenticated = await getProgress(new Request("https://school.example/api/games/progress"));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("cache-control")).toContain("no-store");
    vi.mocked(getSessionUser).mockResolvedValueOnce({ id: "public-participant", name: "参与者", role: "USER" });
    expect((await createProfile(request("profiles", profile))).status).toBe(401);
    expect(repository.createProfile).not.toHaveBeenCalled();
  });

  it("keeps empty account progress empty and exposes the fixed success contracts", async () => {
    const empty = { version: 1, activeProfileId: "", profiles: [], completions: [] };
    repository.getProgress.mockResolvedValueOnce(empty);
    expect(await (await getProgress(new Request("https://school.example/api/games/progress"))).json()).toEqual({ progress: empty });
    const created = await createProfile(request("profiles", profile, { "x-game-account-id": "owner-a" }));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ profile, progress });
    expect(repository.createProfile).toHaveBeenCalledWith("owner-a", { name: profile.name, age: profile.age, avatar: profile.avatar });
    const patched = await updateProfile(request("profiles/child-a", profile, {}, "PATCH"), { params: Promise.resolve({ profileId: "child-a" }) });
    expect(patched.status).toBe(200);
    expect(repository.updateProfile).toHaveBeenCalledWith("owner-a", "child-a", { name: profile.name, age: profile.age, avatar: profile.avatar });
    const completed = await complete(request("completions", { profileId: "child-a", gameId: "magnet", eventId: "event-1" }));
    expect(await completed.json()).toEqual({ progress, points: 10, reason: "完成探索" });
    expect(repository.complete).toHaveBeenCalledWith("owner-a", { profileId: "child-a", gameId: "magnet", eventId: "event-1" });
  });

  it("rejects a switched account before any profile or reward write", async () => {
    const response = await createProfile(request("profiles", profile, { "x-game-account-id": "owner-before-switch" }));
    expect(response.status).toBe(409);
    expect(repository.createProfile).not.toHaveBeenCalled();
    expect((await complete(request("completions", {}, { "x-game-account-id": "owner-before-switch" }))).status).toBe(409);
    expect(repository.complete).not.toHaveBeenCalled();
    expect((await getProgress(new Request("https://school.example/api/games/progress", { headers: { "x-game-account-id": "owner-before-switch" } }))).status).toBe(409);
    expect(repository.getProgress).not.toHaveBeenCalled();
  });

  it("rejects foreign origins, cross-site requests, oversized bodies and invalid JSON", async () => {
    expect((await createProfile(request("profiles", profile, { origin: "https://foreign.example" }))).status).toBe(403);
    expect((await createProfile(request("profiles", profile, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await createProfile(request("profiles", profile, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await createProfile(request("profiles", profile, { "content-length": "9000" }))).status).toBe(413);
    expect((await createProfile(request("profiles", { name: "云".repeat(2000) }))).status).toBe(413);
    expect((await createProfile(new Request("https://school.example/api/games/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status).toBe(400);
    expect(repository.createProfile).not.toHaveBeenCalled();
  });

  it("maps ownership errors to 404 and unavailable database errors to safe no-store 503", async () => {
    repository.updateProfile.mockRejectedValueOnce(new GameServerError("没有找到这个孩子档案。", 404));
    expect((await updateProfile(request("profiles/other", profile, {}, "PATCH"), { params: Promise.resolve({ profileId: "other" }) })).status).toBe(404);
    vi.mocked(getGameRepository).mockImplementationOnce(() => { throw new Error("postgres://private-secret@host:5432/database"); });
    const response = await getProgress(new Request("https://school.example/api/games/progress"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("private-secret");
  });

  it("rejects invalid game fields before resolving an unavailable database", async () => {
    vi.mocked(getGameRepository).mockImplementation(() => { throw new Error("Database unavailable"); });
    expect((await createProfile(request("profiles", { ...profile, age: "invalid" }))).status).toBe(400);
    expect((await complete(request("completions", { profileId: "child-a", gameId: "growth", eventId: "event-1" }))).status).toBe(400);
    expect(getGameRepository).not.toHaveBeenCalled();
  });

  it("serves only the public leaderboard contract without requiring an account", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const response = await board(new Request("https://school.example/api/games/leaderboard?age=%E4%B8%AD%E7%8F%AD"));
    expect(response.status).toBe(200);
    expect(getSessionUser).not.toHaveBeenCalled();
    const body = await response.json();
    expect(Object.keys(body.rows[0]).sort()).toEqual(["age", "avatar", "id", "name", "rank", "topics", "weekPoints"]);
    expect(repository.leaderboard).toHaveBeenCalledWith("中班");
    expect((await board(new Request("https://school.example/api/games/leaderboard?age=unknown"))).status).toBe(400);
  });
});

describe("science game server input", () => {
  it("validates untrusted names, ages, avatars, game IDs and event IDs", () => {
    expect(gameProfileInput({ name: " 芽芽 ", age: "中班", avatar: "seed" })).toEqual({ name: "芽芽", age: "中班", avatar: "seed" });
    for (const input of [{ ...profile, name: " " }, { ...profile, name: "很".repeat(13) }, { ...profile, age: "成人" }, { ...profile, avatar: "photo" }]) expect(() => gameProfileInput(input)).toThrow(GameServerError);
    expect(() => gameCompletionInput({ profileId: "child-a", gameId: "growth", eventId: "event-1" })).toThrow(GameServerError);
    expect(() => gameCompletionInput({ profileId: "child-a", gameId: "magnet", eventId: "x".repeat(129) })).toThrow(GameServerError);
    expect(() => gameCompletionInput({ profileId: "../child", gameId: "magnet", eventId: "ok" })).toThrow(GameServerError);
  });
});
