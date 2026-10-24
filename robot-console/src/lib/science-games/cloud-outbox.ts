import { SCIENCE_GAMES, type GameId } from "./catalog";

export type PendingGameCompletion = { accountId: string; profileId: string; gameId: GameId; eventId: string };
const PREFIX = "kexiaobei.science-games.cloud.outbox.v1.";
export type CloudStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function isCloudIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,128}$/u.test(value);
}

export function isPendingGameCompletion(value: unknown): value is PendingGameCompletion {
  if (!value || typeof value !== "object") return false;
  const entry = value as PendingGameCompletion;
  return isCloudIdentifier(entry.accountId) && isCloudIdentifier(entry.profileId) && isCloudIdentifier(entry.eventId)
    && SCIENCE_GAMES.some(game => game.id === entry.gameId && game.available);
}

/** Each event owns a storage key, so two tabs cannot overwrite each other's queue. */
export function createCloudOutbox(storage: () => CloudStorage) {
  const memory = new Map<string, PendingGameCompletion>();
  const volatile = new Set<string>();
  const removed = new Set<string>();
  const invalid = new Map<string, Set<string>>();
  let storageError = false;
  const key = (event: PendingGameCompletion) => `${PREFIX}${encodeURIComponent(event.accountId)}.${encodeURIComponent(event.eventId)}`;
  function list(accountId: string) {
    const prefix = `${PREFIX}${encodeURIComponent(accountId)}.`;
    try {
      const current = new Map<string, PendingGameCompletion>();
      const invalidKeys = new Set<string>();
      const target = storage();
      for (let i = 0; i < target.length; i++) {
        const entryKey = target.key(i);
        if (!entryKey?.startsWith(prefix) || removed.has(entryKey)) continue;
        try {
          const entry = JSON.parse(target.getItem(entryKey) ?? "null") as PendingGameCompletion | null;
          if (isPendingGameCompletion(entry) && entry.accountId === accountId && key(entry) === entryKey) current.set(entryKey, entry);
          else invalidKeys.add(entryKey);
        } catch { invalidKeys.add(entryKey); }
      }
      for (const [entryKey, entry] of memory) {
        if (entry.accountId !== accountId) continue;
        if (volatile.has(entryKey)) current.set(entryKey, entry);
        else if (!current.has(entryKey)) memory.delete(entryKey);
      }
      for (const [entryKey, entry] of current) memory.set(entryKey, entry);
      invalid.set(accountId, invalidKeys);
    } catch { storageError = true; }
    return [...memory.values()].filter(entry => entry.accountId === accountId && !removed.has(key(entry)));
  }
  return {
    list,
    invalidCount(accountId: string) { return invalid.get(accountId)?.size ?? 0; },
    ownsKey(accountId: string, storageKey: string | null) { return storageKey !== null && storageKey.startsWith(`${PREFIX}${encodeURIComponent(accountId)}.`); },
    get storageError() { return storageError; },
    add(entry: PendingGameCompletion) {
      if (!isPendingGameCompletion(entry)) throw new Error("完成记录格式无效，暂时无法放入同步队列。");
      const entryKey = key(entry);
      memory.set(entryKey, entry); removed.delete(entryKey);
      try { storage().setItem(entryKey, JSON.stringify(entry)); volatile.delete(entryKey); }
      catch { volatile.add(entryKey); storageError = true; }
    },
    remove(entry: PendingGameCompletion) {
      const entryKey = key(entry);
      memory.delete(entryKey); volatile.delete(entryKey); removed.add(entryKey);
      try { storage().removeItem(entryKey); }
      catch { storageError = true; }
    },
    persistVolatile() {
      for (const entryKey of [...volatile]) {
        const entry = memory.get(entryKey);
        if (!entry) continue;
        try { storage().setItem(entryKey, JSON.stringify(entry)); volatile.delete(entryKey); }
        catch { storageError = true; }
      }
    },
  };
}
