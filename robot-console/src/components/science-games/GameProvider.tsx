"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ExplorerProfile, GameProgress } from "@/lib/science-games/progress";
import { createCloudProgressStore, EMPTY_ACCOUNT_PROFILE, type CloudAccount, type CloudStatus, type GameReward } from "@/lib/science-games/cloud-store";
import type { AgeGroup, GameId } from "@/lib/science-games/catalog";

type GameContextValue = {
  progress: GameProgress; profile: ExplorerProfile; ready: boolean; storageError: boolean; artworkIds: string[];
  recordSource: "device" | "account"; account: CloudAccount | null;
  cloudStatus: CloudStatus; cloudError: string | null; cloudBusy: boolean; pendingCount: number;
  useDeviceRecords: () => void;
  openAccountRecords: () => Promise<boolean>;
  startAccountProfile: () => Promise<boolean>;
  retrySync: () => Promise<void>;
  selectProfile: (id: string) => void;
  saveProfile: (name: string, age: AgeGroup, avatar: ExplorerProfile["avatar"], create: boolean) => Promise<boolean>;
  finishGame: (gameId: GameId) => Promise<GameReward>;
};
const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createCloudProgressStore);
  const { progress, ready, storageError, recordSource, account, cloudStatus, cloudError, cloudBusy, pendingCount } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [artworkIds, setArtworkIds] = useState<string[]>([]);

  useEffect(() => {
    const disconnect = store.connect();
    function synchronize(event: StorageEvent) {
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; }
      catch { return; }
      store.synchronize(event);
    }
    window.addEventListener("storage", synchronize);
    function revalidate() { void store.revalidate(); }
    function visibility() { if (!document.hidden) revalidate(); }
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    window.addEventListener("pageshow", revalidate);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disconnect();
      window.removeEventListener("storage", synchronize);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      window.removeEventListener("pageshow", revalidate);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [store]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/games/artwork", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? await response.json() as { available: string[] } : { available: [] })
      .then(result => { if (!controller.signal.aborted && Array.isArray(result.available)) setArtworkIds(result.available); })
      .catch(() => { /* Programmatic placeholders remain available offline. */ });
    return () => controller.abort();
  }, []);

  const profile = progress.profiles.find(item => item.id === progress.activeProfileId) ?? progress.profiles[0] ?? EMPTY_ACCOUNT_PROFILE;
  return <GameContext.Provider value={{
    progress, profile, ready, storageError, artworkIds,
    recordSource, account, cloudStatus, cloudError, cloudBusy, pendingCount,
    useDeviceRecords: store.useDeviceRecords,
    openAccountRecords: store.openAccountRecords,
    startAccountProfile: store.startAccountProfile,
    retrySync: store.retrySync,
    selectProfile: store.selectProfile,
    saveProfile: store.saveProfile,
    finishGame: store.finishGame,
  }}>{children}</GameContext.Provider>;
}

export function useGameProgress() {
  const context = useContext(GameContext);
  if (!context) throw new Error("GameProvider is required");
  return context;
}
