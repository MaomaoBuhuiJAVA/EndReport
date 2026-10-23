import type { AgeGroup, GameId } from "./catalog";
import { chinaDay, completeGame, emptyProgress, parseProgress, type ExplorerProfile, type GameCompletion, type GameProgress } from "./progress";

export const GAME_PROGRESS_STORAGE_KEY = "kexiaobei.science-games.v1";
export const GAME_ACTIVE_PROFILE_SESSION_KEY = `${GAME_PROGRESS_STORAGE_KEY}.active-profile`;
type ProgressStorage = Pick<Storage, "getItem" | "setItem">;
type IdCrypto = { randomUUID?: () => string; getRandomValues?: (array: Uint32Array) => Uint32Array };
type StoreOptions = { storage?: () => ProgressStorage; sessionStorage?: () => ProgressStorage; profileId?: (existingIds: string[]) => string };
type StorageChange = { key: string | null; newValue: string | null };
let profileSequence = 0;

/** randomUUID is absent on many LAN HTTP origins; IDs must still work there. */
export function createProfileId(existingIds: string[] = [], source: IdCrypto | undefined = globalThis.crypto): string {
  let candidate = "";
  try {
    if (typeof source?.randomUUID === "function") candidate = source.randomUUID();
    else if (typeof source?.getRandomValues === "function") candidate = `explorer-${Array.from(source.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, "0")).join("")}`;
  } catch { /* Restricted crypto must not prevent an otherwise local game. */ }
  if (candidate && !existingIds.includes(candidate)) return candidate;
  do {
    profileSequence += 1;
    candidate = `explorer-${Date.now().toString(36)}-${profileSequence.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  } while (existingIds.includes(candidate));
  return candidate;
}

function completionKey(record: GameCompletion) {
  return `${record.profileId}:${chinaDay(new Date(record.completedAt))}:${record.gameId}`;
}

function sameProfile(a: ExplorerProfile, b: ExplorerProfile) {
  return a.name === b.name && a.age === b.age && a.avatar === b.avatar;
}

function sharedData(progress: GameProgress) {
  return JSON.stringify({ profiles: progress.profiles, completions: progress.completions });
}

/** Profiles/rewards are additive; only explicit remove/clear/default reset deletes history. */
function mergeProgress(baseline: GameProgress, local: GameProgress, latest: GameProgress) {
  const profiles = new Map(latest.profiles.map(profile => [profile.id, profile]));
  for (const profile of local.profiles) {
    const previous = baseline.profiles.find(item => item.id === profile.id);
    const current = profiles.get(profile.id);
    if (!current || !previous) profiles.set(profile.id, current ?? profile);
    else if (!sameProfile(profile, previous)) {
      profiles.set(profile.id, {
        ...current,
        ...(profile.name !== previous.name ? { name: profile.name } : {}),
        ...(profile.age !== previous.age ? { age: profile.age } : {}),
        ...(profile.avatar !== previous.avatar ? { avatar: profile.avatar } : {}),
      });
    }
  }
  const completions = new Map<string, GameCompletion>();
  for (const record of [...latest.completions, ...local.completions]) {
    const key = completionKey(record);
    const previous = completions.get(key);
    if (!previous || record.points > previous.points) completions.set(key, record);
  }
  return parseProgress(JSON.stringify({
    version: 1,
    // Another tab selecting a child must not redirect this tab's next reward.
    activeProfileId: profiles.has(local.activeProfileId) ? local.activeProfileId : latest.activeProfileId,
    profiles: [...profiles.values()],
    completions: [...completions.values()].sort((a, b) => a.completedAt.localeCompare(b.completedAt) || completionKey(a).localeCompare(completionKey(b))),
  }));
}

function isDefaultReset(raw: string | null) {
  if (raw === null) return false;
  const progress = parseProgress(raw);
  const initial = emptyProgress();
  return progress.completions.length === 0 && progress.profiles.length === 1
    && progress.activeProfileId === initial.activeProfileId && progress.profiles[0].id === initial.profiles[0].id
    && sameProfile(progress.profiles[0], initial.profiles[0]);
}

export function createProgressStore(options: StoreOptions = {}) {
  const initial = { progress: emptyProgress(), ready: false, storageError: false };
  let snapshot = initial;
  let baseline = initial.progress;
  let baselineRaw: string | null = null;
  const getStorage = options.storage ?? (() => localStorage);
  const getSessionStorage = options.sessionStorage ?? (() => sessionStorage);
  const makeId = options.profileId ?? createProfileId;
  const listeners = new Set<() => void>();
  function update(progress: GameProgress, storageError = false) {
    // sessionStorage survives navigation/reload while staying independent per tab.
    // If it is unavailable, shared storage and this tab's memory remain usable.
    try { getSessionStorage().setItem(GAME_ACTIVE_PROFILE_SESSION_KEY, progress.activeProfileId); }
    catch { /* A missing session pin must not block local games or set storageError. */ }
    snapshot = { progress, ready: true, storageError };
    listeners.forEach(listener => listener());
  }
  function reset(raw: string | null, restoreTabSelection = false) {
    baseline = parseProgress(raw);
    baselineRaw = raw;
    let progress = baseline;
    if (restoreTabSelection) {
      try {
        const pinned = getSessionStorage().getItem(GAME_ACTIVE_PROFILE_SESSION_KEY);
        if (pinned && progress.profiles.some(profile => profile.id === pinned)) progress = { ...progress, activeProfileId: pinned };
      } catch { /* Fall back to the shared default when session storage is denied. */ }
    }
    update(progress);
  }
  function readLatest() {
    const storage = getStorage();
    const raw = storage.getItem(GAME_PROGRESS_STORAGE_KEY);
    const latest = parseProgress(raw);
    // A missed storage event must not resurrect data removed by another tab.
    const cleared = raw === null && baselineRaw !== null;
    const resetToDefault = raw !== baselineRaw && isDefaultReset(raw);
    const current = cleared || resetToDefault ? latest : mergeProgress(baseline, snapshot.progress, latest);
    baseline = latest;
    baselineRaw = raw;
    return { storage, raw, latest, current };
  }
  function persist<T>(change: (progress: GameProgress) => { progress: GameProgress; result: T }): T {
    let read: ReturnType<typeof readLatest>;
    try { read = readLatest(); }
    catch {
      const changed = change(snapshot.progress);
      update(changed.progress, true);
      return changed.result;
    }
    const changed = change(read.current);
    try {
      const raw = JSON.stringify(changed.progress);
      read.storage.setItem(GAME_PROGRESS_STORAGE_KEY, raw);
      baseline = changed.progress;
      baselineRaw = raw;
      update(changed.progress);
    } catch { update(changed.progress, true); }
    return changed.result;
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    load() {
      if (!snapshot.ready) {
        try { reset(getStorage().getItem(GAME_PROGRESS_STORAGE_KEY), true); }
        catch { update(snapshot.progress, true); }
        return;
      }
      try { const read = readLatest(); update(read.current, snapshot.storageError); }
      catch { update(snapshot.progress, true); }
    },
    synchronize(event: StorageChange) {
      if (event.key !== GAME_PROGRESS_STORAGE_KEY && event.key !== null) return;
      // clear()/removeItem()/an explicit empty reset discard in-memory history.
      // No automatic write follows a reset, including unsaved memory-only data.
      if (event.key === null || event.newValue === null || isDefaultReset(event.newValue)) { reset(event.newValue); return; }
      let synchronized = snapshot.progress;
      try {
        const read = readLatest();
        synchronized = read.current;
        // Repair a simultaneous write that omitted this tab's additive records.
        // A tab's active selection is local; never ping-pong writes just for it.
        if (sharedData(read.current) !== sharedData(read.latest)) {
          const persisted = { ...read.current, activeProfileId: read.latest.activeProfileId };
          const raw = JSON.stringify(persisted);
          read.storage.setItem(GAME_PROGRESS_STORAGE_KEY, raw);
          baseline = persisted;
          baselineRaw = raw;
        }
        update(read.current);
      } catch { update(synchronized, true); }
    },
    selectProfile(id: string) {
      persist(progress => ({ progress: progress.profiles.some(profile => profile.id === id) ? { ...progress, activeProfileId: id } : progress, result: undefined }));
    },
    saveProfile(name: string, age: AgeGroup, avatar: ExplorerProfile["avatar"], create: boolean) {
      const trimmed = name.trim().slice(0, 12);
      if (!trimmed) return;
      persist(progress => {
        const id = create ? makeId(progress.profiles.map(profile => profile.id)) : progress.activeProfileId;
        const profile = { id, name: trimmed, age, avatar };
        return { progress: { ...progress, activeProfileId: id, profiles: create ? [...progress.profiles, profile] : progress.profiles.map(item => item.id === id ? profile : item) }, result: undefined };
      });
    },
    finishGame(gameId: GameId, now = new Date()) {
      return persist(progress => {
        const completed = completeGame(progress, progress.activeProfileId, gameId, now);
        return { progress: completed.progress, result: { points: completed.points, reason: completed.reason } };
      });
    },
  };
}
