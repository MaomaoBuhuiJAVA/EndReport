"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Info, RefreshCw, Trophy } from "lucide-react";
import { AGE_GROUPS, type AgeGroup } from "@/lib/science-games/catalog";
import { chinaWeek, explorerStats, leaderboard } from "@/lib/science-games/progress";
import type { ExplorerProfile } from "@/lib/science-games/progress";
import { useGameProgress } from "./GameProvider";
import { ExplorerAvatar } from "./ExplorerAvatar";
import styles from "./ExplorationBoard.module.css";

type BoardRow = ExplorerProfile & { weekPoints: number; topics: number; rank: number };
type OnlineBoard = { key: string; rows: BoardRow[]; weekStart?: string; weekEnd?: string; error?: string };

export function ExplorationBoard() {
  const { progress, profile, recordSource } = useGameProgress();
  const [age, setAge] = useState(profile.age);
  const [scope, setScope] = useState<"device" | "online">(recordSource === "account" ? "online" : "device");
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState<OnlineBoard | null>(null);
  const queryKey = `${age}:${attempt}`;
  const currentWeek = chinaWeek(new Date());
  const loading = scope === "online" && online?.key !== queryKey;
  const error = scope === "online" && online?.key === queryKey ? online.error : null;
  useEffect(() => {
    if (scope !== "online") return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 12000);
    void fetch(`/api/games/leaderboard?${new URLSearchParams({ age })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "联网周榜暂时无法打开。");
      if (!Array.isArray(data.rows)) throw new Error("榜单暂时无法读取，请稍后重试。");
      if (!controller.signal.aborted) setOnline({ key: queryKey, rows: data.rows, weekStart: data.weekStart, weekEnd: data.weekEnd });
    }).catch(error => {
      if (!disposed) setOnline({ key: queryKey, rows: [], error: controller.signal.aborted ? "读取超时，请检查网络后重试。" : error instanceof Error ? error.message : "网络暂时中断，请重试。" });
    }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [scope, age, queryKey]);
  const rows: BoardRow[] = scope === "device" ? leaderboard(progress, age).map(row => ({
    ...row,
    topics: new Set(progress.completions.filter(record => record.profileId === row.id && chinaWeek(new Date(record.completedAt)) === currentWeek).map(record => record.gameId)).size,
  })) : !loading && !error ? online?.rows ?? [] : [];
  const stats = explorerStats(progress, profile.id);
  const weekStart = new Date(`${scope === "online" && online?.key === queryKey && online.weekStart ? online.weekStart : currentWeek}T00:00:00Z`);
  // API end is the exclusive next-Monday boundary; the label shows Sunday.
  const weekEnd = scope === "online" && online?.key === queryKey && online.weekEnd ? new Date(new Date(`${online.weekEnd}T00:00:00Z`).getTime() - 86400000) : new Date(weekStart.getTime() + 6 * 86400000);
  const formatDate = (date: Date) => `${date.getUTCMonth() + 1}.${String(date.getUTCDate()).padStart(2, "0")}`;
  const isMine = (id: string) => scope === "device" || recordSource === "account" ? id === profile.id : false;
  function changeAge(value: AgeGroup) { setAge(value); }
  return <div className={styles.board}>
    <section className={styles.heading}>
      <div><p className={styles.kicker}><span /> {scope === "online" ? "一起发现科学" : "我的科学游戏记录"}</p><h1>探索排行榜<span>。</span></h1><p className={styles.subtitle}>看看这一周，大家玩过哪些科学主题。</p></div>
      <span className={styles.weekTag}><span>本周</span><strong>{formatDate(weekStart)} — {formatDate(weekEnd)}</strong></span>
    </section>
    <div className={styles.sourceTabs} role="group" aria-label="榜单范围"><button type="button" aria-pressed={scope === "device"} onClick={() => setScope("device")}>{recordSource === "account" ? "账号手册" : "本机手册"}</button><button type="button" aria-pressed={scope === "online"} onClick={() => setScope("online")}>联网周榜</button>{scope === "online" && <button type="button" className={styles.refreshBoard} onClick={() => setAttempt(value => value + 1)} aria-label="刷新联网周榜"><RefreshCw size={15} /></button>}</div>
    <div className={styles.boardToolbar}><div className={styles.ageTabs} role="group" aria-label="按年龄段查看">{AGE_GROUPS.map(item => <button key={item} onClick={() => changeAge(item)} aria-pressed={age === item} className={age === item ? styles.tabActive : ""}>{item}</button>)}</div><span className={styles.participants}>{loading ? "正在读取…" : error ? "" : `${rows.length} 位探索家`}</span></div>
    <section className={styles.boardList} aria-label={`${age}探索榜`}>
      <div className={styles.boardLabels}><span>排名</span><span>探索家</span><span>本周积分</span></div>
      {loading ? <div className={styles.empty} role="status"><p>正在翻开本周的探索记录…</p></div> : error ? <div className={styles.empty} role="status"><span className={styles.emptyAvatar}><ExplorerAvatar kind="cloud" /></span><h2>联网周榜暂时没能打开</h2><p>{error}</p><button type="button" className={styles.secondaryButton} onClick={() => setAttempt(value => value + 1)}>再试一次 <RefreshCw size={15} /></button></div> : rows.length ? rows.map(row => <div key={row.id} className={`${styles.boardRow} ${isMine(row.id) ? styles.myBoardRow : ""}`}><span className={`${styles.rank} ${row.rank === 1 && row.weekPoints > 0 ? styles.firstRank : ""}`}>{row.weekPoints === 0 ? "—" : row.rank === 1 ? <Trophy size={20} strokeWidth={1.8} aria-label="第一名" /> : String(row.rank).padStart(2, "0")}</span><div className={styles.rowIdentity}><span className={styles.boardAvatar}><ExplorerAvatar kind={row.avatar} /></span><div><strong>{row.name}{isMine(row.id) && <small>我</small>}</strong><span>{row.weekPoints ? `探索了 ${row.topics} 个主题` : "本周还没有游戏记录"}</span></div></div><strong className={styles.boardPoints}>{row.weekPoints}<small> 分</small></strong></div>) : <div className={styles.empty}><span className={styles.emptyAvatar}><ExplorerAvatar kind="seed" /></span><h2>{age}还没有游戏记录</h2><p>{scope === "online" ? "开启账号手册，完成游戏后就能留下你的发现。" : "为孩子建立档案，完成游戏后就会出现在这里。"}</p><Link href="/games/growth" className={styles.secondaryButton}>{scope === "online" ? "打开成长手册" : "添加孩子档案"} <ArrowRight size={16} /></Link></div>}
    </section>
    <div className={styles.mySummary}><span className={styles.summaryAvatar}><ExplorerAvatar kind={profile.avatar} /></span><div className={styles.summaryName}><strong>{profile.name}</strong><span>{profile.age} · 我的记录</span></div><div className={styles.summaryStat}><strong>{stats.weekPoints}<small> 分</small></strong><span>本周</span></div><div className={styles.summaryStat}><strong>{stats.totalPoints}<small> 分</small></strong><span>累计</span></div><Link href="/games" className={styles.playLink}>去玩游戏 <ArrowRight size={16} /></Link></div>
    <div className={styles.localNotice}><Info size={15} /><p>{scope === "online" ? "联网周榜汇总账号手册的已确认积分。下方个人统计来自当前手册，待同步记录尚未计入。" : recordSource === "account" ? "当前仅显示此账号的孩子手册。切换联网周榜，可查看所有参与者的积分排名。" : "本机手册仅显示这台设备的试玩记录。切换联网周榜，可查看账号手册的积分排名。"}</p></div>
    <details className={styles.rules}><summary>积分与榜单规则</summary><p>每款游戏每天首次完成获得 10 分，每天最多获得 30 分。按北京时间每周一 00:00 开启新周，累计积分保留。各年龄段分别排名，同分并列；0 分档案暂不显示名次。使用提示和重复游玩均不扣分。</p><p>账号记录以服务端收到完成事件的时间计分，断网补交可能计入下一天。本机已有分数保留在原手册，不会转入联网周榜。</p></details>
  </div>;
}
