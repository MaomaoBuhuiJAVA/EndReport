"use client";

import Link from "next/link";
import { ArrowRight, Check, Cloud, HardDrive, RefreshCw } from "lucide-react";
import { useGameProgress } from "./GameProvider";
import styles from "./AccountRecords.module.css";

export function AccountRecords() {
  const { profile, account, recordSource, cloudStatus, cloudBusy, cloudError, pendingCount, useDeviceRecords, openAccountRecords, startAccountProfile, retrySync } = useGameProgress();
  const cloud = recordSource === "account";
  return <section className={styles.records} aria-labelledby="record-source-title" aria-busy={cloudBusy}>
    <div className={styles.heading}><span className={styles.icon}>{cloud ? <Cloud size={21} strokeWidth={1.5} /> : <HardDrive size={20} strokeWidth={1.5} />}</span><div><h2 id="record-source-title">{cloud ? "账号手册" : "本机手册"}</h2><p>{cloud ? `${account?.name ?? "我的账号"} · ${pendingCount ? `${pendingCount} 条记录待同步` : cloudStatus === "ready" ? "记录已保存，可在其他设备继续" : "同步暂未完成，可以稍后重试"}` : "在这台设备上，留下每一次科学发现。"}</p></div>{cloud && cloudStatus === "ready" && !pendingCount && <Check size={16} className={styles.saved} aria-label="已同步" />}</div>
    <div className={styles.actions}>
      {cloud ? <><button type="button" onClick={() => void retrySync()} disabled={cloudBusy}><RefreshCw size={14} /> {cloudBusy ? "正在同步…" : "同步记录"}</button><button type="button" onClick={useDeviceRecords} disabled={cloudBusy}>查看本机手册 <ArrowRight size={14} /></button></> : account ? <><button type="button" onClick={() => void openAccountRecords()} disabled={cloudBusy}>打开账号手册 <ArrowRight size={14} /></button><button type="button" onClick={() => void startAccountProfile()} disabled={cloudBusy}>为 {profile.name} 开启账号记录</button></> : <Link href="/auth?next=%2Fgames%2Fgrowth">登录，保存到账号 <ArrowRight size={14} /></Link>}
    </div>
    {!cloud && <p className={styles.note}>{account ? "新账号档案从开启后开始记录。本机已有积分留在原手册。" : "不用登录也能玩。账号手册可保存之后的游戏记录，方便换设备继续。"}</p>}
    {cloud && <p className={styles.note}>每天首次完成每款游戏 +10 分。断网补交按服务端收到记录的日期计分。</p>}
    {cloudError && <p className={styles.error} role="status">{cloudError}</p>}
    {cloudStatus === "checking" && <p className={styles.note} role="status">正在检查账号记录…</p>}
  </section>;
}

export function GameSyncNotice() {
  const { recordSource, pendingCount, cloudError, cloudBusy, retrySync } = useGameProgress();
  if (recordSource !== "account" || !pendingCount && !cloudError) return null;
  return <div className={styles.syncNotice} role="status"><Cloud size={16} /><span>{cloudError || `${pendingCount} 条完成记录待同步，联网后可重试。`}</span><button type="button" onClick={() => void retrySync()} disabled={cloudBusy}>{cloudBusy ? "同步中…" : "重试"}</button></div>;
}
