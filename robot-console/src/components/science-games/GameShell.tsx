"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Atom, BookOpen, Compass, Sprout, Trophy } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { GameProvider, useGameProgress } from "./GameProvider";
import { ExplorerAvatar } from "./ExplorerAvatar";
import { GameSyncNotice } from "./AccountRecords";
import styles from "./ScienceGames.module.css";

const navigation = [
  { href: "/games", label: "科学乐园", icon: Compass },
  { href: "/games/leaderboard", label: "探索榜", icon: Trophy },
  { href: "/games/growth", label: "我的成长", icon: Sprout },
];

function Content({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, storageError, profile, recordSource } = useGameProgress();
  const playing = pathname.startsWith("/games/play/");
  return <div className={styles.app} data-playing={playing}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={playing ? "/games" : "/"} className={styles.backLink} aria-label={playing ? "返回科学乐园" : "返回科小贝首页"}><ArrowLeft size={19} /><span>{playing ? "返回乐园" : "科小贝首页"}</span></Link>
        {playing && ready ? <Link href="/games/growth" className={styles.playingProfile} aria-label={`当前孩子：${profile.name}，切换孩子档案`}><ExplorerAvatar kind={profile.avatar} /><span><strong>{profile.name}</strong><small>{recordSource === "account" ? "账号手册 · 科学实验台" : "本机手册 · 科学实验台"}</small></span></Link> : <Link href="/games" className={styles.brand}><span className={styles.brandMark}><Atom size={23} strokeWidth={1.6} /></span><span>科小贝<span className={styles.brandSuffix}> · 科学乐园</span></span></Link>}
        <Link href="/games/leaderboard" className={styles.artLink} aria-label="积分榜"><Trophy size={17} strokeWidth={1.6} /><span>积分榜</span></Link>
      </div>
    </header>
    <main className={`${styles.main} ${playing ? styles.playMain : ""}`}>
      {storageError && <p className={styles.storageNotice} role="status">浏览器暂时无法保存记录，本次仍可游玩，关闭页面后进度可能丢失。</p>}
      {ready && <GameSyncNotice />}
      {ready ? <Fragment key={`${recordSource}:${profile.id}`}>{children}</Fragment> : <div className={styles.loading} role="status"><Sprout size={30} /><p>正在打开你的探索手册…</p></div>}
    </main>
    {!playing && <nav className={styles.bottomNav} aria-label="科学乐园导航">{navigation.map(item => {
      const active = pathname === item.href;
      return <Link key={item.href} href={item.href} className={active ? styles.navActive : ""} aria-current={active ? "page" : undefined}><item.icon size={21} /><span>{item.label}</span></Link>;
    })}<Link href="/lab"><BookOpen size={21} /><span>资源库</span></Link></nav>}
  </div>;
}

export function GameShell({ children }: { children: ReactNode }) {
  return <GameProvider><Content>{children}</Content></GameProvider>;
}
