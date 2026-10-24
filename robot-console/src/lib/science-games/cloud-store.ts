import { AGE_GROUPS, SCIENCE_GAMES, type AgeGroup, type GameId } from "./catalog";
import type { ExplorerProfile, GameProgress } from "./progress";
import { createProfileId, createProgressStore } from "./progress-store";
import { createCloudOutbox, isCloudIdentifier, isPendingGameCompletion, type CloudStorage, type PendingGameCompletion } from "./cloud-outbox";

export type GameReward = { points: number; reason: string; pending?: boolean };
export type CloudAccount = { id: string; name: string };
export type CloudStatus = "checking" | "ready" | "offline" | "error";
export type CloudProgressSnapshot = {
  progress: GameProgress; ready: boolean; storageError: boolean;
  recordSource: "device" | "account"; account: CloudAccount | null;
  cloudStatus: CloudStatus; cloudError: string | null; cloudBusy: boolean; pendingCount: number;
};
export const EMPTY_ACCOUNT_PROFILE: ExplorerProfile = { id: "account-no-profile", name: "请先添加孩子", age: "中班", avatar: "planet" };
const emptyAccountProgress = (): GameProgress => ({ version: 1, activeProfileId: "", profiles: [], completions: [] });
const PREFIX = "kexiaobei.science-games.cloud.v1.";
const PENDING_REWARD: GameReward = { points: 0, reason: "已完成，积分待同步。联网并确认账号后会自动重试。", pending: true };

type SessionStorage = Pick<Storage, "getItem" | "setItem">;
type StoreOptions = {
  fetch?: typeof fetch;
  storage?: () => CloudStorage;
  sessionStorage?: () => SessionStorage;
  deviceStore?: ReturnType<typeof createProgressStore>;
  eventId?: () => string;
};
export class CloudRequestError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

/** Validate transport data without applying device reward rules to server history. */
export function readCloudProgress(value: unknown): GameProgress {
  if (!value || typeof value !== "object") throw new CloudRequestError("账号记录格式有误，请稍后重试。");
  const data = value as GameProgress;
  if (data.version !== 1 || !Array.isArray(data.profiles) || !Array.isArray(data.completions)) throw new CloudRequestError("账号记录格式有误，请稍后重试。");
  const profiles = data.profiles;
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (!profile || typeof profile.id !== "string" || !profile.id || ids.has(profile.id) || typeof profile.name !== "string" || !profile.name.trim() || !AGE_GROUPS.includes(profile.age) || !["seed", "planet", "cloud"].includes(profile.avatar)) throw new CloudRequestError("账号孩子档案格式有误，请重试。");
    ids.add(profile.id);
  }
  for (const record of data.completions) {
    if (!record || typeof record.id !== "string" || !ids.has(record.profileId) || !SCIENCE_GAMES.some(game => game.id === record.gameId) || !Number.isFinite(Date.parse(record.completedAt)) || !Number.isFinite(record.points) || record.points < 0) throw new CloudRequestError("账号积分格式有误，请重试。");
  }
  return { version: 1, profiles: [...profiles], completions: [...data.completions], activeProfileId: ids.has(data.activeProfileId) ? data.activeProfileId : profiles[0]?.id ?? "" };
}

export function createCloudProgressStore(options: StoreOptions = {}) {
  const device = options.deviceStore ?? createProgressStore();
  const getStorage = options.storage ?? (() => localStorage);
  const getSession = options.sessionStorage ?? (() => sessionStorage);
  const request = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const makeEventId = options.eventId ?? (() => createProfileId());
  const outbox = createCloudOutbox(getStorage);
  const listeners = new Set<() => void>();
  const controllers = new Set<AbortController>();
  const tabMemory = new Map<string, string>();
  let source: "device" | "account" = "device";
  let account: CloudAccount | null = null;
  let accountProgress = emptyAccountProgress();
  let cloudStatus: CloudStatus = "checking";
  let cloudError: string | null = null;
  let storageError = false;
  let identityConfirmed = false;
  let epoch = 0;
  let identityRequest = 0;
  let sourceIntent = 0;
  let active = false;
  let busy = 0;
  let unsubscribeDevice: (() => void) | null = null;
  let serial: Promise<unknown> = Promise.resolve();
  const initial: CloudProgressSnapshot = { ...device.getServerSnapshot(), recordSource: source, account: null, cloudStatus, cloudError: null, cloudBusy: false, pendingCount: 0 };
  let snapshot: CloudProgressSnapshot = initial;

  function publish() {
    const local = device.getSnapshot();
    const validCount = account ? outbox.list(account.id).length : 0;
    const invalidCount = account ? outbox.invalidCount(account.id) : 0;
    const invalidNotice = invalidCount ? `${invalidCount} 条待同步记录格式异常，原记录已保留；其他有效记录可继续同步。` : null;
    snapshot = { ...local, progress: source === "account" ? accountProgress : local.progress, storageError: local.storageError || storageError || outbox.storageError, recordSource: source, account, cloudStatus: invalidCount && cloudStatus === "ready" ? "error" : cloudStatus, cloudError: [cloudError, invalidNotice].filter(Boolean).join(" ") || null, cloudBusy: busy > 0, pendingCount: validCount + invalidCount };
    listeners.forEach(listener => listener());
  }
  function tabValue(accountId: string, kind: "source" | "profile", value?: string) {
    const key = `${PREFIX}${kind}.${accountId}`;
    if (value !== undefined) {
      tabMemory.set(key, value);
      try { getSession().setItem(key, value); } catch { storageError = true; }
      return value;
    }
    if (tabMemory.has(key)) return tabMemory.get(key) ?? null;
    try { const stored = getSession().getItem(key); if (stored) tabMemory.set(key, stored); return stored; }
    catch { storageError = true; return null; }
  }
  function applyProgress(progress: GameProgress, accountId: string, selected?: string, persistCache = true) {
    const pinned = selected ?? tabValue(accountId, "profile") ?? accountProgress.activeProfileId;
    accountProgress = { ...progress, activeProfileId: progress.profiles.some(profile => profile.id === pinned) ? pinned : progress.profiles[0]?.id ?? "" };
    if (accountProgress.activeProfileId) tabValue(accountId, "profile", accountProgress.activeProfileId);
    if (persistCache) {
      try { getStorage().setItem(`${PREFIX}cache.${accountId}`, JSON.stringify(accountProgress)); } catch { storageError = true; }
    }
  }
  function restoreCache(accountId: string) {
    try {
      const raw = getStorage().getItem(`${PREFIX}cache.${accountId}`);
      if (raw) applyProgress(readCloudProgress(JSON.parse(raw)), accountId);
    } catch { storageError = true; }
  }
  function setIdentity(next: CloudAccount | null) {
    if (account?.id !== next?.id) {
      epoch++;
      source = "device";
      accountProgress = emptyAccountProgress();
      account = next;
      if (next) restoreCache(next.id);
    } else account = next;
    identityConfirmed = true;
  }
  async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await request(url, { ...init, credentials: "same-origin", cache: "no-store", signal: controller.signal });
      let data: unknown;
      try { data = await response.json(); } catch { throw new CloudRequestError("服务器暂时没有返回有效记录。", response.status); }
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "账号记录暂时无法同步，请稍后重试。";
        throw new CloudRequestError(message, response.status);
      }
      return data as T;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function errorState(error: unknown) {
    if (error instanceof CloudRequestError && error.status === 401) {
      setIdentity(null); cloudStatus = "ready"; cloudError = "登录已失效，已返回本机记录。待同步探索仍保留在原账号。"; publish(); return;
    }
    identityConfirmed = false;
    cloudStatus = error instanceof CloudRequestError ? "error" : "offline";
    cloudError = error instanceof Error ? error.message : "暂时无法连接账号记录。";
    publish();
  }
  async function verifyIdentity(): Promise<CloudAccount | null> {
    const revision = ++identityRequest;
    let result: { user: { id: string; name: string } | null };
    try { result = await json("/api/auth/me"); }
    catch (error) {
      if (!active || revision !== identityRequest) throw new CloudRequestError("账号检查已更新。");
      if (error instanceof CloudRequestError && error.status === 401) result = { user: null };
      else { errorState(error); throw error; }
    }
    if (!active || revision !== identityRequest) throw new CloudRequestError("账号检查已更新。");
    if (result.user && !isCloudIdentifier(result.user.id)) throw new CloudRequestError("登录状态格式有误。");
    const next = result.user ? { id: result.user.id, name: result.user.name || "家长" } : null;
    setIdentity(next);
    cloudStatus = "ready"; cloudError = null; publish();
    return next;
  }
  function isCurrent(accountId: string, stamp: number) { return active && identityConfirmed && account?.id === accountId && stamp === epoch; }
  async function fetchProgress(accountId: string, stamp: number) {
    const data = await json<{ progress: unknown }>("/api/games/progress", { headers: { "X-Game-Account-Id": accountId } });
    if (!isCurrent(accountId, stamp)) return false;
    applyProgress(readCloudProgress(data.progress), accountId);
    publish(); return true;
  }
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = serial.then(operation, operation);
    serial = task.catch(() => undefined);
    return task;
  }
  async function working<T>(operation: () => Promise<T>) {
    busy++; publish();
    try { return await operation(); } finally { busy--; publish(); }
  }
  async function sendCompletion(entry: PendingGameCompletion, stamp: number): Promise<GameReward | null> {
    if (!isCurrent(entry.accountId, stamp)) return null;
    const data = await json<{ progress: unknown; points: number; reason: string }>("/api/games/completions", { method: "POST", headers: { "Content-Type": "application/json", "X-Game-Account-Id": entry.accountId }, body: JSON.stringify({ profileId: entry.profileId, gameId: entry.gameId, eventId: entry.eventId }) });
    if (!isCurrent(entry.accountId, stamp)) return null;
    const progress = readCloudProgress(data.progress);
    if (!Number.isFinite(data.points) || typeof data.reason !== "string") throw new CloudRequestError("积分确认结果有误，请稍后重试。");
    applyProgress(progress, entry.accountId);
    outbox.remove(entry);
    cloudStatus = "ready"; cloudError = null; publish();
    return { points: data.points, reason: data.reason };
  }
  async function flush(accountId: string, stamp: number) {
    outbox.persistVolatile();
    const rejected: string[] = [];
    for (const entry of outbox.list(accountId)) {
      if (!isCurrent(accountId, stamp)) return;
      try { if (!await sendCompletion(entry, stamp)) return; }
      catch (error) {
        if (!isCurrent(accountId, stamp)) return;
        if (error instanceof CloudRequestError && [400, 404].includes(error.status)) { rejected.push(error.message); continue; }
        errorState(error); return;
      }
    }
    if (rejected.length && isCurrent(accountId, stamp)) {
      cloudStatus = "error";
      cloudError = `${rejected.length} 条完成记录暂时无法确认：${rejected[0]} 原记录已保留，其他记录已继续同步。`;
      publish();
    }
  }
  async function refresh() {
    try {
      const current = await verifyIdentity();
      if (!current) return;
      const stamp = epoch;
      if (source !== "account" && tabValue(current.id, "source") === "account") source = "account";
      if (source === "account") {
        if (await fetchProgress(current.id, stamp)) await flush(current.id, stamp);
      }
      publish();
    } catch (error) { if (active && !(error instanceof CloudRequestError && error.message === "账号检查已更新。")) errorState(error); }
  }

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    connect() {
      active = true;
      unsubscribeDevice?.(); unsubscribeDevice = device.subscribe(publish);
      device.load();
      void enqueue(refresh);
      return () => {
        active = false; epoch++; identityRequest++;
        unsubscribeDevice?.(); unsubscribeDevice = null;
        controllers.forEach(controller => controller.abort());
      };
    },
    synchronize(event: { key: string | null; newValue: string | null }) {
      device.synchronize(event);
      if (source === "account" && account && identityConfirmed) {
        if (event.key === `${PREFIX}cache.${account.id}` && event.newValue) {
          try { applyProgress(readCloudProgress(JSON.parse(event.newValue)), account.id, undefined, false); }
          catch { cloudError = "其他页面的账号缓存格式异常，当前记录已保留。请重试同步。"; cloudStatus = "error"; }
        }
        if (event.key === null || outbox.ownsKey(account.id, event.key)) void enqueue(refresh);
      }
      publish();
    },
    revalidate() { identityConfirmed = false; identityRequest++; return enqueue(refresh); },
    selectProfile(id: string) {
      if (source === "device") device.selectProfile(id);
      else if (account && accountProgress.profiles.some(profile => profile.id === id)) { accountProgress = { ...accountProgress, activeProfileId: id }; tabValue(account.id, "profile", id); publish(); }
    },
    useDeviceRecords() {
      epoch++; sourceIntent++; source = "device";
      if (account) tabValue(account.id, "source", "device");
      cloudError = null; publish();
    },
    openAccountRecords(): Promise<boolean> {
      const intent = ++sourceIntent;
      return enqueue(() => working(async () => {
        try {
          if (intent !== sourceIntent) return false;
          const current = await verifyIdentity();
          if (intent !== sourceIntent) return false;
          if (!current) { cloudError = "请先登录家长账号，再打开账号探索记录。"; publish(); return false; }
          const stamp = epoch;
          if (!await fetchProgress(current.id, stamp)) return false;
          if (intent !== sourceIntent) return false;
          if (!accountProgress.profiles.length) { cloudError = "账号还没有孩子档案。可以把当前本机孩子的昵称、年龄和头像创建为新档案；旧积分不会上传。"; publish(); return false; }
          epoch++; source = "account"; tabValue(current.id, "source", "account"); publish();
          await flush(current.id, epoch);
          return true;
        } catch (error) { if (active) errorState(error); return false; }
      }));
    },
    startAccountProfile(): Promise<boolean> {
      const intent = ++sourceIntent;
      const local = device.getSnapshot().progress;
      const profile = local.profiles.find(item => item.id === local.activeProfileId) ?? local.profiles[0];
      return enqueue(() => working(async () => {
        try {
          if (intent !== sourceIntent) return false;
          const current = await verifyIdentity();
          if (intent !== sourceIntent) return false;
          if (!current) { cloudError = "请先登录家长账号，再创建账号孩子档案。"; publish(); return false; }
          const stamp = epoch;
          const data = await json<{ profile: ExplorerProfile; progress: unknown }>("/api/games/profiles", { method: "POST", headers: { "Content-Type": "application/json", "X-Game-Account-Id": current.id }, body: JSON.stringify({ name: profile.name, age: profile.age, avatar: profile.avatar }) });
          if (intent !== sourceIntent || !isCurrent(current.id, stamp)) return false;
          applyProgress(readCloudProgress(data.progress), current.id, data.profile.id);
          epoch++; source = "account"; tabValue(current.id, "source", "account"); cloudError = null; publish();
          return true;
        } catch (error) { if (active) errorState(error); return false; }
      }));
    },
    saveProfile(name: string, age: AgeGroup, avatar: ExplorerProfile["avatar"], create: boolean): Promise<boolean> {
      const trimmed = name.trim().slice(0, 12);
      if (!trimmed) return Promise.resolve(false);
      if (source === "device") { device.saveProfile(trimmed, age, avatar, create); return Promise.resolve(true); }
      const accountId = account?.id;
      const profileId = accountProgress.activeProfileId;
      const intent = sourceIntent;
      return enqueue(() => working(async () => {
        try {
          const current = await verifyIdentity();
          if (!current || current.id !== accountId || source !== "account" || sourceIntent !== intent) return false;
          const stamp = epoch;
          const data = await json<{ profile: ExplorerProfile; progress: unknown }>(create ? "/api/games/profiles" : `/api/games/profiles/${encodeURIComponent(profileId)}`, { method: create ? "POST" : "PATCH", headers: { "Content-Type": "application/json", "X-Game-Account-Id": current.id }, body: JSON.stringify({ name: trimmed, age, avatar }) });
          if (!isCurrent(current.id, stamp)) return false;
          applyProgress(readCloudProgress(data.progress), current.id, data.profile.id); cloudError = null; publish();
          return true;
        } catch (error) { if (active) errorState(error); return false; }
      }));
    },
    finishGame(gameId: GameId): Promise<GameReward> {
      if (source === "device") return Promise.resolve(device.finishGame(gameId));
      const accountId = account?.id;
      const profileId = accountProgress.activeProfileId;
      if (!accountId || !accountProgress.profiles.some(profile => profile.id === profileId)) return Promise.resolve({ points: 0, reason: "请先添加账号孩子档案，再记录探索积分。" });
      const entry = { accountId, profileId, gameId, eventId: makeEventId() };
      if (!isPendingGameCompletion(entry)) return Promise.resolve({ points: 0, reason: "这个游戏或孩子档案暂时无法记录积分，请刷新后再试。" });
      outbox.add(entry); publish();
      return enqueue(() => working(async () => {
        try {
          const current = await verifyIdentity();
          if (!current || current.id !== accountId || source !== "account") return { ...PENDING_REWARD, reason: "已完成，积分待同步。请回到原账号重试，不会记入其他账号。" };
          return await sendCompletion(entry, epoch) ?? { ...PENDING_REWARD };
        } catch (error) {
          if (active && account?.id === accountId) {
            if (error instanceof CloudRequestError && [400, 404].includes(error.status)) {
              cloudStatus = "error"; cloudError = `完成记录暂时无法确认：${error.message} 原记录已保留，其他记录仍可同步。`; publish();
              return { ...PENDING_REWARD, reason: cloudError };
            }
            errorState(error);
          }
          return { ...PENDING_REWARD };
        }
      }));
    },
    retrySync(): Promise<void> { return enqueue(() => working(refresh)); },
  };
}
