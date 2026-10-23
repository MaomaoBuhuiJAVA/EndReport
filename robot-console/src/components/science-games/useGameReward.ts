"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameId } from "@/lib/science-games/catalog";
import { useGameProgress } from "./GameProvider";

export type GameReward = { points: number; reason: string; pending?: boolean; confirmed?: boolean };

/** A reply for an earlier round must never reappear after reset or navigation. */
export function useGameReward(gameId: GameId) {
  const { finishGame, pendingCount, cloudError, cloudStatus } = useGameProgress();
  const finishRef = useRef(finishGame);
  const generation = useRef(0);
  const mounted = useRef(false);
  const [reward, setReward] = useState<GameReward | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => { finishRef.current = finishGame; }, [finishGame]);
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    return () => { mounted.current = false; };
  }, []);
  const clearReward = useCallback(() => { generation.current++; setReward(null); setPending(false); }, []);
  const award = useCallback(() => {
    const request = ++generation.current;
    setPending(true);
    void (async () => {
      try {
        const result = await finishRef.current(gameId);
        if (mounted.current && generation.current === request) setReward(result);
      } catch {
        if (mounted.current && generation.current === request) setReward({ points: 0, pending: true, reason: "游戏已完成，记录暂未保存。请在成长手册中重试同步。" });
      } finally { if (mounted.current && generation.current === request) setPending(false); }
    })();
  }, [gameId]);
  const confirmed = reward?.pending && pendingCount === 0 && !cloudError && cloudStatus === "ready";
  return { reward: confirmed ? { ...reward, pending: false, confirmed: true, reason: "完成记录已同步，最新积分可在成长手册查看。" } : reward, pending, award, clearReward };
}
