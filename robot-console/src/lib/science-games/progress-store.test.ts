import { afterEach, describe, expect, it, vi } from "vitest";
import { createProfileId, createProgressStore, GAME_ACTIVE_PROFILE_SESSION_KEY, GAME_PROGRESS_STORAGE_KEY } from "./progress-store";
import { emptyProgress, explorerStats, parseProgress } from "./progress";

const now = new Date("2026-10-22T04:00:00Z");

function memoryStorage() {
  const values = new Map<string, string>();
  let readsDenied = false;
  let writesDenied = false;
  let writes = 0;
  return {
    values,
    get writes() { return writes; },
    deny(reads: boolean, write = reads) { readsDenied = reads; writesDenied = write; },
    getItem(key: string) { if (readsDenied) throw new Error("Storage denied"); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (writesDenied) throw new Error("Storage quota"); writes++; values.set(key, value); },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("science game progress store", () => {
  it("keeps each tab's selected child after hard recreation while new tabs use the shared default", () => {
    const storage = memoryStorage();
    const sessionA = memoryStorage();
    const sessionB = memoryStorage();
    const optionsA = { storage: () => storage, sessionStorage: () => sessionA };
    const optionsB = { storage: () => storage, sessionStorage: () => sessionB, profileId: () => "child-b" };
    const first = createProgressStore(optionsA);
    const second = createProgressStore(optionsB);
    first.load(); second.load();
    second.saveProfile("云云", "大班", "cloud", true);
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    expect(first.getSnapshot().progress.activeProfileId).toBe("first-explorer");
    expect(sessionA.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("first-explorer");
    expect(sessionB.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("child-b");
    const recreatedA = createProgressStore(optionsA);
    const recreatedB = createProgressStore(optionsB);
    const newSession = memoryStorage();
    const newTab = createProgressStore({ storage: () => storage, sessionStorage: () => newSession });
    recreatedA.load(); recreatedB.load(); newTab.load();
    expect(recreatedA.getSnapshot().progress.activeProfileId).toBe("first-explorer");
    expect(recreatedB.getSnapshot().progress.activeProfileId).toBe("child-b");
    expect(newTab.getSnapshot().progress.activeProfileId).toBe("child-b");
    recreatedA.finishGame("water", now);
    recreatedB.finishGame("magnet", now);
    expect(new Set(parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY)).completions.map(record => `${record.profileId}:${record.gameId}`))).toEqual(new Set(["child-b:magnet", "first-explorer:water"]));
    recreatedA.selectProfile("child-b");
    expect(sessionA.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("child-b");
    const selectedAgain = createProgressStore(optionsA);
    selectedAgain.load();
    expect(selectedAgain.getSnapshot().progress.activeProfileId).toBe("child-b");
  });

  it("replaces an invalid pin after a child disappears and never revives it after shared clear", () => {
    const storage = memoryStorage();
    const session = memoryStorage();
    const options = { storage: () => storage, sessionStorage: () => session, profileId: () => "child-b" };
    const first = createProgressStore(options);
    first.load(); first.saveProfile("云云", "大班", "cloud", true); first.finishGame("magnet", now);
    expect(session.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("child-b");
    storage.values.clear();
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: null });
    expect(first.getSnapshot().progress).toEqual(emptyProgress());
    expect(session.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("first-explorer");
    // A sleeping/reloaded tab may miss the clear event entirely.
    session.setItem(GAME_ACTIVE_PROFILE_SESSION_KEY, "child-b");
    const recreated = createProgressStore(options);
    recreated.load();
    expect(recreated.getSnapshot().progress).toEqual(emptyProgress());
    expect(session.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("first-explorer");
    recreated.finishGame("water", now);
    expect(parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY)).profiles).toEqual(emptyProgress().profiles);
  });

  it("falls back to shared selection for a stale pin and tolerates denied session storage", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage, profileId: () => "child-b" });
    first.load(); first.saveProfile("云云", "大班", "cloud", true);
    const session = memoryStorage();
    session.setItem(GAME_ACTIVE_PROFILE_SESSION_KEY, "removed-child");
    const restored = createProgressStore({ storage: () => storage, sessionStorage: () => session });
    restored.load();
    expect(restored.getSnapshot().progress.activeProfileId).toBe("child-b");
    expect(session.getItem(GAME_ACTIVE_PROFILE_SESSION_KEY)).toBe("child-b");
    const denied = createProgressStore({ storage: () => storage, sessionStorage: () => { throw new Error("Session storage blocked"); } });
    denied.load(); denied.selectProfile("first-explorer");
    expect(denied.finishGame("water", now).points).toBe(10);
    expect(denied.getSnapshot()).toMatchObject({ storageError: false, progress: { activeProfileId: "first-explorer" } });
    expect(parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY)).completions[0].profileId).toBe("first-explorer");
  });

  it("creates durable distinct IDs without secure-context crypto, even with a fixed clock/random", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = createProfileId([], {});
    const second = createProfileId([first], {});
    expect(first).not.toBe(second);
    expect(second).toMatch(/^explorer-/);
    const blockedCrypto = { randomUUID() { throw new Error("Not supported"); } };
    expect(createProfileId([first, second], blockedCrypto)).not.toBe(second);
    expect(createProfileId(["same-id"], { randomUUID: () => "same-id" })).not.toBe("same-id");

    const storage = memoryStorage();
    const store = createProgressStore({ storage: () => storage, profileId: ids => createProfileId(ids, {}) });
    store.load();
    store.saveProfile("星星", "小班", "seed", true);
    const savedId = store.getSnapshot().progress.activeProfileId;
    const restored = createProgressStore({ storage: () => storage });
    restored.load();
    expect(restored.getSnapshot().progress.activeProfileId).toBe(savedId);
    expect(restored.getSnapshot().progress.profiles.find(profile => profile.id === savedId)?.name).toBe("星星");
  });

  it("rebases stale tabs before writing so another child's profile and reward are kept", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage, profileId: () => "child-a" });
    const stale = createProgressStore({ storage: () => storage, profileId: () => "child-b" });
    first.load(); stale.load();
    first.saveProfile("芽芽", "小班", "seed", true);
    expect(first.finishGame("magnet", now).points).toBe(10);
    stale.saveProfile("云云", "大班", "cloud", true);
    expect(stale.finishGame("water", now).points).toBe(10);

    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(saved.profiles.map(profile => profile.id)).toEqual(["first-explorer", "child-a", "child-b"]);
    expect(saved.completions.map(record => [record.profileId, record.gameId])).toEqual([["child-a", "magnet"], ["child-b", "water"]]);
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    expect(first.getSnapshot().progress.activeProfileId).toBe("child-a");
    expect(first.getSnapshot().progress.completions).toHaveLength(2);
    const writeCount = storage.writes;
    stale.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    expect(storage.writes).toBe(writeCount);
  });

  it("does not restore stale profile fields or reward a game already completed in another tab", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage });
    const stale = createProgressStore({ storage: () => storage });
    first.load(); stale.load();
    first.saveProfile("新的名字", "大班", "cloud", false);
    expect(first.finishGame("magnet", now).points).toBe(10);
    expect(stale.finishGame("magnet", now).points).toBe(0);
    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(saved.profiles[0]).toMatchObject({ name: "新的名字", age: "大班", avatar: "cloud" });
    expect(saved.completions).toHaveLength(1);
  });

  it("repairs interleaved tab writes by merging distinct completion keys on storage events", () => {
    const storage = memoryStorage();
    storage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(emptyProgress()));
    const initialRaw = storage.getItem(GAME_PROGRESS_STORAGE_KEY);
    let simulateStaleRead = false;
    const first = createProgressStore({ storage: () => storage });
    const racing = createProgressStore({ storage: () => ({
      getItem(key) { if (simulateStaleRead) { simulateStaleRead = false; return initialRaw; } return storage.getItem(key); },
      setItem: storage.setItem,
    }) });
    first.load(); racing.load();
    first.finishGame("magnet", now);
    // Simulate both tabs having read the same value before either write.
    simulateStaleRead = true;
    racing.finishGame("water", now);
    expect(parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY)).completions).toHaveLength(1);
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    racing.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(new Set(saved.completions.map(record => record.gameId))).toEqual(new Set(["magnet", "water"]));
    expect(explorerStats(saved, "first-explorer", now).totalPoints).toBe(20);
  });

  it("recovers both profiles if two tabs created children from the same initial snapshot", () => {
    const storage = memoryStorage();
    const initialRaw = JSON.stringify(emptyProgress());
    storage.setItem(GAME_PROGRESS_STORAGE_KEY, initialRaw);
    let staleRead = false;
    const first = createProgressStore({ storage: () => storage, profileId: () => "child-a" });
    const racing = createProgressStore({ storage: () => ({
      getItem(key) { if (staleRead) { staleRead = false; return initialRaw; } return storage.getItem(key); },
      setItem: storage.setItem,
    }), profileId: () => "child-b" });
    first.load(); racing.load();
    first.saveProfile("芽芽", "小班", "seed", true);
    staleRead = true;
    racing.saveProfile("云云", "大班", "cloud", true);
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    racing.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(new Set(saved.profiles.map(profile => profile.id))).toEqual(new Set(["first-explorer", "child-a", "child-b"]));
    expect(first.getSnapshot().progress.activeProfileId).toBe("child-a");
    expect(racing.getSnapshot().progress.activeProfileId).toBe("child-b");
  });

  it("continues in memory when storage access is denied and later merges unsaved work", () => {
    const storage = memoryStorage();
    let denied = true;
    const offline = createProgressStore({ storage: () => { if (denied) throw new Error("Blocked localStorage"); return storage; }, profileId: () => "offline-child" });
    offline.load();
    offline.saveProfile("离线孩子", "中班", "seed", true);
    expect(offline.finishGame("magnet", now).points).toBe(10);
    expect(offline.finishGame("magnet", now).points).toBe(0);
    expect(offline.getSnapshot()).toMatchObject({ ready: true, storageError: true });
    const other = createProgressStore({ storage: () => storage, profileId: () => "other-child" });
    other.load(); other.saveProfile("另一孩子", "大班", "cloud", true);
    denied = false;
    expect(offline.finishGame("water", now).points).toBe(10);
    expect(offline.getSnapshot().storageError).toBe(false);
    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(new Set(saved.profiles.map(profile => profile.id))).toEqual(new Set(["first-explorer", "other-child", "offline-child"]));
    expect(saved.completions).toHaveLength(2);
    expect(explorerStats(saved, "offline-child", now).totalPoints).toBe(20);
  });

  it("retains memory rewards after quota failures and merges a remote profile edit on recovery", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage });
    first.load();
    storage.deny(false, true);
    expect(first.finishGame("magnet", now).points).toBe(10);
    expect(first.getSnapshot().storageError).toBe(true);
    storage.deny(false);
    const other = createProgressStore({ storage: () => storage });
    other.load(); other.saveProfile("远程改名", "小班", "cloud", false);
    first.finishGame("water", now);
    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(saved.profiles[0].name).toBe("远程改名");
    expect(saved.completions).toHaveLength(2);
    expect(first.getSnapshot().storageError).toBe(false);
  });

  it("keeps both local and remote data when a storage-event repair hits a quota error", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage });
    first.load();
    storage.deny(false, true);
    first.finishGame("magnet", now);
    storage.deny(false);
    const other = createProgressStore({ storage: () => storage, profileId: () => "other-child" });
    other.load(); other.saveProfile("云云", "大班", "cloud", true);
    storage.deny(false, true);
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    expect(first.getSnapshot().storageError).toBe(true);
    expect(first.getSnapshot().progress.profiles.map(profile => profile.id)).toContain("other-child");
    expect(first.getSnapshot().progress.completions).toHaveLength(1);
    storage.deny(false);
    first.finishGame("water", now);
    expect(parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY)).completions).toHaveLength(2);
  });

  it("treats remove/clear as a reset and never automatically writes the old history back", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage, profileId: () => "child-a" });
    first.load(); first.saveProfile("芽芽", "小班", "seed", true); first.finishGame("magnet", now);
    const missedEvent = createProgressStore({ storage: () => storage });
    missedEvent.load();
    const writeCount = storage.writes;
    storage.values.clear();
    first.synchronize({ key: null, newValue: null });
    expect(first.getSnapshot().progress).toEqual(emptyProgress());
    expect(storage.writes).toBe(writeCount);
    expect(missedEvent.finishGame("water", now).points).toBe(10);
    const saved = parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY));
    expect(saved.profiles).toEqual(emptyProgress().profiles);
    expect(saved.completions.map(record => record.gameId)).toEqual(["water"]);
  });

  it("also honors an explicit default reset stored by another tab", () => {
    const storage = memoryStorage();
    const first = createProgressStore({ storage: () => storage });
    first.load(); first.finishGame("magnet", now);
    const missedEvent = createProgressStore({ storage: () => storage });
    missedEvent.load();
    storage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(emptyProgress()));
    const writeCount = storage.writes;
    first.synchronize({ key: GAME_PROGRESS_STORAGE_KEY, newValue: storage.getItem(GAME_PROGRESS_STORAGE_KEY) });
    expect(first.getSnapshot().progress).toEqual(emptyProgress());
    expect(storage.writes).toBe(writeCount);
    missedEvent.finishGame("water", now);
    expect(parseProgress(storage.getItem(GAME_PROGRESS_STORAGE_KEY)).completions.map(record => record.gameId)).toEqual(["water"]);
  });
});
