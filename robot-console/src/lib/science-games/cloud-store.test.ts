import { describe, expect, it, vi } from "vitest";
import { createCloudProgressStore } from "./cloud-store";
import { createCloudOutbox, type CloudStorage } from "./cloud-outbox";
import { createProgressStore, GAME_PROGRESS_STORAGE_KEY } from "./progress-store";
import { type ExplorerProfile, type GameProgress } from "./progress";

class MemoryStorage implements CloudStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const child = (id: string, name = id): ExplorerProfile => ({ id, name, age: "中班", avatar: "planet" });
const cloudProgress = (profiles = [child("child-a"), child("child-b")]): GameProgress => ({ version: 1, activeProfileId: profiles[0]?.id ?? "", profiles, completions: [] });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function environment(storage = new MemoryStorage(), tab = new MemoryStorage()) {
  let user: { id: string; name: string } | null = { id: "account-a", name: "家长 A" };
  let offline = false;
  let progress = cloudProgress();
  let submittedEvents = 0;
  let dropAcknowledgement = false;
  const rejectedEvents = new Map<string, number>();
  const events = new Map<string, { points: number; reason: string }>();
  const requests: { url: string; body: Record<string, unknown> | null }[] = [];
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
    requests.push({ url: String(url), body });
    if (offline) throw new TypeError("Network unavailable");
    if (String(url) === "/api/auth/me") return response({ user });
    if (!user) return response({ error: "请先登录" }, 401);
    if (String(url) === "/api/games/progress") return response({ progress });
    if (String(url) === "/api/games/profiles") {
      const profile = { ...body, id: "created-child" } as ExplorerProfile;
      progress = { ...progress, profiles: [...progress.profiles, profile] };
      return response({ profile, progress });
    }
    if (String(url) === "/api/games/completions") {
      const eventId = String(body!.eventId);
      if (rejectedEvents.has(eventId)) return response({ error: "这条完成记录需要检查" }, rejectedEvents.get(eventId));
      if (!progress.profiles.some(profile => profile.id === body?.profileId)) return response({ error: "孩子档案已不存在" }, 404);
      if (!events.has(eventId)) {
        submittedEvents++;
        events.set(eventId, { points: 10, reason: "积分已确认" });
        progress = { ...progress, completions: [...progress.completions, { id: eventId, profileId: String(body!.profileId), gameId: body!.gameId as "magnet", completedAt: "2026-10-22T12:00:00.000Z", points: 10 }] };
      }
      if (dropAcknowledgement) { dropAcknowledgement = false; throw new TypeError("The response was lost after the server committed"); }
      return response({ progress, ...events.get(eventId) });
    }
    throw new Error(`Unexpected endpoint ${String(url)}`);
  }) as typeof fetch;
  const device = createProgressStore({ storage: () => storage, sessionStorage: () => tab });
  let eventSequence = 0;
  const store = createCloudProgressStore({ fetch: transport, storage: () => storage, sessionStorage: () => tab, deviceStore: device, eventId: () => `event-${++eventSequence}` });
  return {
    store, storage, tab, requests, device,
    set user(value: typeof user) { user = value; },
    set offline(value: boolean) { offline = value; },
    set progress(value: GameProgress) { progress = value; },
    loseNextAcknowledgement() { dropAcknowledgement = true; },
    rejectEvent(eventId: string, status: number) { rejectedEvents.set(eventId, status); },
    get submittedEvents() { return submittedEvents; },
  };
}

describe("account game records", () => {
  it("leaves device records untouched and enters account mode only after an explicit action", async () => {
    const env = environment();
    const disconnect = env.store.connect();
    try {
      await env.store.retrySync();
      expect(env.store.getSnapshot()).toMatchObject({ recordSource: "device", account: { id: "account-a" } });
      await env.store.finishGame("magnet");
      const localRecord = env.storage.getItem(GAME_PROGRESS_STORAGE_KEY);
      expect(await env.store.openAccountRecords()).toBe(true);
      expect(env.store.getSnapshot().progress.completions).toHaveLength(0);
      expect(await env.store.finishGame("water")).toMatchObject({ points: 10 });
      expect(env.storage.getItem(GAME_PROGRESS_STORAGE_KEY)).toBe(localRecord);
      env.store.useDeviceRecords();
      expect(env.store.getSnapshot().progress.completions[0].gameId).toBe("magnet");
    } finally { disconnect(); }
  });

  it("handles an empty account and copies only the local child's details when explicitly creating", async () => {
    const env = environment();
    env.progress = cloudProgress([]);
    const disconnect = env.store.connect();
    try {
      await env.store.retrySync();
      await env.store.saveProfile("豆豆", "大班", "seed", false);
      await env.store.finishGame("magnet");
      expect(await env.store.openAccountRecords()).toBe(false);
      expect(env.store.getSnapshot()).toMatchObject({ recordSource: "device", cloudError: expect.stringContaining("还没有孩子") });
      expect(await env.store.startAccountProfile()).toBe(true);
      expect(env.store.getSnapshot()).toMatchObject({ recordSource: "account", progress: { activeProfileId: "created-child", completions: [] } });
      expect(env.requests.find(request => request.url === "/api/games/profiles")?.body).toEqual({ name: "豆豆", age: "大班", avatar: "seed" });
    } finally { disconnect(); }
  });

  it("keeps an offline completion bound to its account and child, then confirms the same event on retry", async () => {
    const env = environment();
    const disconnect = env.store.connect();
    try {
      expect(await env.store.openAccountRecords()).toBe(true);
      env.offline = true;
      expect(await env.store.finishGame("shadow")).toMatchObject({ points: 0, pending: true, reason: expect.stringContaining("积分待同步") });
      expect(env.store.getSnapshot()).toMatchObject({ cloudStatus: "offline", pendingCount: 1 });
      expect(env.store.getSnapshot().progress.completions).toHaveLength(0);
      env.store.selectProfile("child-b");
      env.offline = false;
      await env.store.retrySync();
      expect(env.store.getSnapshot()).toMatchObject({ pendingCount: 0, progress: { activeProfileId: "child-b" } });
      expect(env.store.getSnapshot().progress.completions[0]).toMatchObject({ profileId: "child-a", gameId: "shadow", points: 10 });
      expect(env.requests.find(request => request.url === "/api/games/completions")?.body).toMatchObject({ eventId: "event-1", profileId: "child-a" });
      expect(env.submittedEvents).toBe(1);
    } finally { disconnect(); }
  });

  it("never uploads a queued old-account event when the browser has changed accounts", async () => {
    const env = environment();
    const disconnect = env.store.connect();
    try {
      await env.store.openAccountRecords();
      env.offline = true;
      await env.store.finishGame("magnet");
      env.offline = false;
      env.user = { id: "account-b", name: "家长 B" };
      env.progress = cloudProgress([child("another-child")]);
      await env.store.retrySync();
      expect(env.store.getSnapshot()).toMatchObject({ recordSource: "device", account: { id: "account-b" }, pendingCount: 0 });
      expect(env.requests.filter(request => request.url === "/api/games/completions")).toHaveLength(0);
      env.user = { id: "account-a", name: "家长 A" };
      env.progress = cloudProgress();
      await env.store.retrySync();
      expect(env.store.getSnapshot()).toMatchObject({ recordSource: "account", pendingCount: 0 });
      expect(env.submittedEvents).toBe(1);
    } finally { disconnect(); }
  });

  it("retries the original event after the server accepted it but its acknowledgement was lost", async () => {
    const env = environment();
    const disconnect = env.store.connect();
    try {
      await env.store.openAccountRecords();
      env.loseNextAcknowledgement();
      expect(await env.store.finishGame("magnet")).toMatchObject({ pending: true, points: 0 });
      expect(env.submittedEvents).toBe(1);
      expect(env.store.getSnapshot().progress.completions).toHaveLength(0);
      await env.store.retrySync();
      const requests = env.requests.filter(request => request.url === "/api/games/completions");
      expect(requests).toHaveLength(2);
      expect(requests[0].body?.eventId).toBe(requests[1].body?.eventId);
      expect(env.submittedEvents).toBe(1);
      expect(env.store.getSnapshot()).toMatchObject({ pendingCount: 0, progress: { completions: [{ points: 10 }] } });
    } finally { disconnect(); }
  });

  it("restores account mode and child after navigation while another tab keeps its own selection", async () => {
    const shared = new MemoryStorage();
    const firstTab = new MemoryStorage();
    const one = environment(shared, firstTab);
    const disconnectOne = one.store.connect();
    await one.store.openAccountRecords();
    one.store.selectProfile("child-b");
    const two = environment(shared, new MemoryStorage());
    const disconnectTwo = two.store.connect();
    await two.store.openAccountRecords();
    expect(two.store.getSnapshot().progress.activeProfileId).toBe("child-a");
    two.store.selectProfile("child-a");
    disconnectOne();
    const navigated = environment(shared, firstTab);
    const disconnectNavigated = navigated.store.connect();
    try {
      await navigated.store.retrySync();
      expect(navigated.store.getSnapshot()).toMatchObject({ recordSource: "account", progress: { activeProfileId: "child-b" } });
      expect(two.store.getSnapshot().progress.activeProfileId).toBe("child-a");
    } finally { disconnectTwo(); disconnectNavigated(); }
  });

  it("ignores a completion response after the user switches back to device records", async () => {
    const storage = new MemoryStorage();
    const tab = new MemoryStorage();
    let resolveCompletion: ((response: Response) => void) | undefined;
    const transport = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "/api/auth/me") return response({ user: { id: "account-a", name: "家长" } });
      if (String(url) === "/api/games/progress") return response({ progress: cloudProgress() });
      return new Promise<Response>(resolve => { resolveCompletion = resolve; });
    }) as typeof fetch;
    const store = createCloudProgressStore({ fetch: transport, storage: () => storage, sessionStorage: () => tab, deviceStore: createProgressStore({ storage: () => storage, sessionStorage: () => tab }) });
    const disconnect = store.connect();
    try {
      await store.openAccountRecords();
      const completion = store.finishGame("water");
      await vi.waitFor(() => expect(resolveCompletion).toBeDefined());
      store.useDeviceRecords();
      resolveCompletion!(response({ progress: cloudProgress(), points: 10, reason: "已确认" }));
      expect(await completion).toMatchObject({ pending: true });
      expect(store.getSnapshot()).toMatchObject({ recordSource: "device", progress: { activeProfileId: "first-explorer", completions: [] } });
    } finally { disconnect(); }
  });

  it("does not override an explicit device choice when an account-open request finishes late", async () => {
    const storage = new MemoryStorage();
    const tab = new MemoryStorage();
    let resolveProgress: ((response: Response) => void) | undefined;
    const transport = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "/api/auth/me") return response({ user: { id: "account-a", name: "家长" } });
      return new Promise<Response>(resolve => { resolveProgress = resolve; });
    }) as typeof fetch;
    const store = createCloudProgressStore({ fetch: transport, storage: () => storage, sessionStorage: () => tab, deviceStore: createProgressStore({ storage: () => storage, sessionStorage: () => tab }) });
    const disconnect = store.connect();
    try {
      const opening = store.openAccountRecords();
      await vi.waitFor(() => expect(resolveProgress).toBeDefined());
      store.useDeviceRecords();
      resolveProgress!(response({ progress: cloudProgress() }));
      expect(await opening).toBe(false);
      expect(store.getSnapshot().recordSource).toBe("device");
    } finally { disconnect(); }
  });

  it("keeps rejected records while submitting valid later entries instead of blocking the queue", async () => {
    const env = environment();
    const queue = createCloudOutbox(() => env.storage);
    queue.add({ accountId: "account-a", profileId: "child-a", gameId: "magnet", eventId: "invalid-event" });
    queue.add({ accountId: "account-a", profileId: "deleted-child", gameId: "water", eventId: "old-child-event" });
    queue.add({ accountId: "account-a", profileId: "child-b", gameId: "shadow", eventId: "valid-event" });
    env.rejectEvent("invalid-event", 400);
    const disconnect = env.store.connect();
    try {
      await env.store.openAccountRecords();
      expect(env.submittedEvents).toBe(1);
      expect(env.store.getSnapshot()).toMatchObject({ cloudStatus: "error", pendingCount: 2, cloudError: expect.stringContaining("原记录已保留") });
      expect(env.store.getSnapshot().progress.completions[0]).toMatchObject({ id: "valid-event", profileId: "child-b", gameId: "shadow" });
      expect(queue.list("account-a").map(entry => entry.eventId)).toEqual(["invalid-event", "old-child-event"]);
    } finally { disconnect(); }
  });

  it("reports malformed and unopened-game records without deleting them or sending them to the server", async () => {
    const env = environment();
    const prefix = "kexiaobei.science-games.cloud.outbox.v1.account-a.";
    env.storage.setItem(`${prefix}broken-json`, "{broken");
    env.storage.setItem(`${prefix}unopened`, JSON.stringify({ accountId: "account-a", profileId: "child-a", gameId: "growth", eventId: "unopened" }));
    env.storage.setItem(`${prefix}bad-profile`, JSON.stringify({ accountId: "account-a", profileId: "../child", gameId: "water", eventId: "bad-profile" }));
    env.storage.setItem(`${prefix}long-event`, JSON.stringify({ accountId: "account-a", profileId: "child-a", gameId: "water", eventId: "x".repeat(129) }));
    const disconnect = env.store.connect();
    try {
      await env.store.openAccountRecords();
      expect(env.store.getSnapshot()).toMatchObject({ cloudStatus: "error", pendingCount: 4, cloudError: expect.stringContaining("4 条待同步记录格式异常") });
      expect(await env.store.finishGame("growth")).toMatchObject({ points: 0, reason: expect.stringContaining("暂时无法记录") });
      expect(env.requests.filter(request => request.url === "/api/games/completions")).toHaveLength(0);
      expect(await env.store.finishGame("water")).toMatchObject({ points: 10 });
      expect(env.store.getSnapshot().pendingCount).toBe(4);
      expect(env.storage.getItem(`${prefix}broken-json`)).toBe("{broken");
      expect(env.storage.getItem(`${prefix}unopened`)).not.toBeNull();
    } finally { disconnect(); }
  });

  it("restores the queued account and tab child after a hard reload and revalidates automatically on reconnect", async () => {
    const first = environment();
    const disconnectFirst = first.store.connect();
    await first.store.openAccountRecords();
    first.store.selectProfile("child-b");
    first.offline = true;
    await first.store.finishGame("water");
    disconnectFirst();
    const reload = environment(first.storage, first.tab);
    reload.offline = true;
    const disconnectReload = reload.store.connect();
    try {
      await reload.store.revalidate();
      expect(reload.store.getSnapshot()).toMatchObject({ recordSource: "device", cloudStatus: "offline" });
      reload.offline = false;
      await reload.store.revalidate();
      expect(reload.store.getSnapshot()).toMatchObject({ recordSource: "account", pendingCount: 0, progress: { activeProfileId: "child-b" } });
      expect(reload.requests.find(request => request.url === "/api/games/completions")?.body).toMatchObject({ profileId: "child-b", eventId: "event-1" });
    } finally { disconnectReload(); }
  });

  it("syncs another tab's queue and server cache without copying its selected child or causing a cache-write loop", async () => {
    const shared = new MemoryStorage();
    const first = environment(shared);
    const second = environment(shared);
    const disconnectFirst = first.store.connect();
    const disconnectSecond = second.store.connect();
    try {
      await first.store.openAccountRecords(); await second.store.openAccountRecords();
      first.store.selectProfile("child-a"); second.store.selectProfile("child-b");
      first.offline = true;
      await first.store.finishGame("water");
      const queuedKey = [...shared.values.keys()].find(key => key.startsWith("kexiaobei.science-games.cloud.outbox."))!;
      second.store.synchronize({ key: queuedKey, newValue: shared.getItem(queuedKey) });
      await vi.waitFor(() => expect(second.submittedEvents).toBe(1));
      expect(second.store.getSnapshot().progress.activeProfileId).toBe("child-b");
      const cacheKey = "kexiaobei.science-games.cloud.v1.cache.account-a";
      const confirmedCache = shared.getItem(cacheKey)!;
      first.store.synchronize({ key: cacheKey, newValue: confirmedCache });
      // Identity was offline/unconfirmed; stale cache must wait until identity is checked.
      expect(first.store.getSnapshot().progress.completions).toHaveLength(0);
      first.offline = false;
      first.progress = JSON.parse(confirmedCache) as GameProgress;
      await first.store.revalidate();
      second.store.synchronize({ key: cacheKey, newValue: shared.getItem(cacheKey) });
      expect(second.store.getSnapshot().progress.activeProfileId).toBe("child-b");
      expect(second.store.getSnapshot().progress.completions).toHaveLength(1);
      expect(shared.getItem(cacheKey)).not.toBeNull();
    } finally { disconnectFirst(); disconnectSecond(); }
  });
});

describe("persistent completion outbox", () => {
  it("uses independent event keys across tabs and preserves a stable id after reload", () => {
    const storage = new MemoryStorage();
    const first = createCloudOutbox(() => storage);
    const second = createCloudOutbox(() => storage);
    const event = { accountId: "account-a", profileId: "child-a", gameId: "water" as const, eventId: "stable-event" };
    first.add(event);
    second.add({ ...event, eventId: "another-event" });
    const reload = createCloudOutbox(() => storage);
    expect(reload.list("account-a")).toHaveLength(2);
    reload.remove(event);
    expect(first.list("account-a")).toEqual([{ ...event, eventId: "another-event" }]);
    expect(reload.list("account-b")).toEqual([]);
  });

  it("retains pending work in memory when browser storage is blocked", () => {
    const queue = createCloudOutbox(() => { throw new Error("Storage disabled"); });
    const event = { accountId: "account-a", profileId: "child-a", gameId: "water" as const, eventId: "memory-event" };
    queue.add(event);
    expect(queue.list("account-a")).toEqual([event]);
    expect(queue.storageError).toBe(true);
    queue.remove(event);
    expect(queue.list("account-a")).toEqual([]);
  });

  it("rejects invalid or unopened-game entries before adding them to browser storage", () => {
    const storage = new MemoryStorage();
    const queue = createCloudOutbox(() => storage);
    const entry = { accountId: "account-a", profileId: "child-a", gameId: "water" as const, eventId: "valid-event" };
    expect(() => queue.add({ ...entry, gameId: "growth" })).toThrow("格式无效");
    expect(() => queue.add({ ...entry, accountId: "another/account" })).toThrow("格式无效");
    expect(() => queue.add({ ...entry, profileId: "" })).toThrow("格式无效");
    expect(() => queue.add({ ...entry, eventId: "a".repeat(129) })).toThrow("格式无效");
    expect(storage.length).toBe(0);
  });
});
