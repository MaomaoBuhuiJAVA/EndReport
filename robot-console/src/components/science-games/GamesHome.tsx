"use client";

import Link from "next/link";
import { ArrowRight, Check, MoveUpRight, Trophy } from "lucide-react";
import { explorerStats } from "@/lib/science-games/progress";
import { useGameProgress } from "./GameProvider";
import { ExplorerAvatar } from "./ExplorerAvatar";
import { MagnetIllustration, ShadowIllustration, WaterIllustration } from "./HomeGameIllustrations";
import styles from "./GamesHome.module.css";

export function GamesHome() {
  const { profile, progress, recordSource } = useGameProgress();
  const stats = explorerStats(progress, profile.id);
  const magnetDone = stats.completedToday.includes("magnet");
  const waterDone = stats.completedToday.includes("water");
  const shadowDone = stats.completedToday.includes("shadow");

  return <div className={styles.home}>
    <section className={styles.introduction} aria-labelledby="games-heading">
      <div>
        <p className={styles.smallTitle}><span /> 科小贝的动手科学馆</p>
        <h1 id="games-heading">今天，玩点科学<span>。</span></h1>
      </div>
      <p className={styles.introNote}>磁力、沉浮，还有光和影。<br />选一个实验，直接动手玩。</p>
    </section>

    <section className={styles.playCollection} aria-label="可以动手玩的小游戏">
      <article className={styles.magnetCard}>
        <div className={styles.magnetCopy}>
          <p className={styles.gameNumber}><span>01</span> 移动 · 吸附 · 打捞</p>
          <h2>磁力打捞</h2>
          <p className={styles.gameDescription}>拖动磁铁，把散落的小零件<br className={styles.desktopBreak} /> 一个个送回收集区。</p>
          {magnetDone && <span className={styles.finished}><Check size={13} /> 今天已完成</span>}
        </div>
        <div className={styles.magnetArt} aria-hidden="true"><MagnetIllustration /></div>
        <span className={styles.handwritten} aria-hidden="true">试试吸住它！<svg viewBox="0 0 64 34" fill="none"><path d="M3 6c17 1 32 16 53 16M49 13l10 9-11 7" /></svg></span>
        <Link href="/games/play/magnet" className={styles.playButton}>{magnetDone ? "再玩一次" : "开始打捞"}<ArrowRight size={20} /></Link>
        <span className={styles.ageNote}>3—6 岁 · 手指拖动</span>
      </article>

      <article className={styles.waterCard}>
        <div className={styles.waterCopy}>
          <p className={styles.gameNumber}><span>02</span> 拖动 · 落水 · 观察</p>
          <h2>沉浮实验室</h2>
          <p className={styles.gameDescription}>把物品放进水里，<br />看看它们会停在哪里。</p>
          {waterDone && <span className={styles.finished}><Check size={13} /> 今天已完成</span>}
        </div>
        <div className={styles.waterArt} aria-hidden="true"><WaterIllustration /></div>
        <Link href="/games/play/water" className={styles.waterButton}>{waterDone ? "再试一试" : "打开实验"}<MoveUpRight size={19} /></Link>
      </article>
    </section>

    <article className={styles.shadowCard}>
      <div className={styles.shadowCopy}>
        <p className={styles.gameNumber}><span>03</span> 移动 · 照亮 · 变形</p>
        <h2>影子工坊</h2>
        <p className={styles.gameDescription}>挪动小球和灯，<br />让墙上的影子刚刚好。</p>
        {shadowDone && <span className={styles.finished}><Check size={13} /> 今天已完成</span>}
      </div>
      <div className={styles.shadowArt} aria-hidden="true"><ShadowIllustration /></div>
      <Link href="/games/play/shadow" className={styles.shadowButton}>{shadowDone ? "再玩一次" : "打开灯光"}<ArrowRight size={18} /></Link>
    </article>

    <section className={styles.notebook} aria-label="我的游戏记录">
      <Link className={styles.profile} href="/games/growth">
        <span className={styles.profileIcon}><ExplorerAvatar kind={profile.avatar} /></span>
        <span><strong>{profile.name}</strong><small>{profile.age} · 我的游戏记录</small></span>
      </Link>
      <div className={styles.weekScore}><strong>{stats.weekPoints}<small> 分</small></strong><span>本周积分</span></div>
      <div className={styles.topicScore}><strong>{stats.topics}<small> 个</small></strong><span>玩过的主题</span></div>
      <div className={styles.recordLinks}>
        <Link href="/games/growth">成长记录 <ArrowRight size={15} /></Link>
        <Link href="/games/leaderboard"><Trophy size={15} /> 探索排行榜 <ArrowRight size={15} /></Link>
      </div>
    </section>

    <footer className={styles.pageFooter}>
      <p>每天首次完成每款游戏 +10 分<span> · </span>{recordSource === "account" ? "账号手册，可在其他设备继续" : "本机手册，保存在这台设备"}</p>
      <Link href="/lab?type=%E7%A7%91%E5%AD%A6%E5%AE%9E%E9%AA%8C">寻找更多科学实验 <MoveUpRight size={14} /></Link>
    </footer>
  </div>;
}
