"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Flashlight, Leaf, Magnet, Pencil, Plus, Waves } from "lucide-react";
import { AGE_GROUPS, SCIENCE_GAMES, type AgeGroup } from "@/lib/science-games/catalog";
import { explorerStats, type ExplorerProfile } from "@/lib/science-games/progress";
import { useGameProgress } from "./GameProvider";
import { ExplorerAvatar } from "./ExplorerAvatar";
import { AccountRecords } from "./AccountRecords";
import styles from "./ExplorerGrowth.module.css";

const avatarNames = { seed: "嫩芽", planet: "星球", cloud: "云朵" };
const topicIcons = { magnet: Magnet, water: Waves, shadow: Flashlight, growth: Leaf };

export function ExplorerGrowth() {
  const { progress, profile, saveProfile, selectProfile, recordSource, cloudBusy } = useGameProgress();
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState<AgeGroup>(profile.age);
  const [avatar, setAvatar] = useState<ExplorerProfile["avatar"]>(profile.avatar);
  const [saving, setSaving] = useState(false);
  const locked = cloudBusy || saving;
  const stats = explorerStats(progress, profile.id);
  const records = progress.completions.filter(record => record.profileId === profile.id).slice().reverse();
  function edit(mode: "new" | "edit") { setName(mode === "new" ? "" : profile.name); setAge(profile.age); setAvatar(profile.avatar); setEditing(mode); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || locked) return;
    setSaving(true);
    try { if (await saveProfile(name, age, avatar, editing === "new")) setEditing(null); }
    finally { setSaving(false); }
  }
  const availableGames = SCIENCE_GAMES.filter(game => game.available);
  return <div className={styles.growth}>
    <div className={styles.pageHeading}><div><p className={styles.kicker}><span /> 孩子的科学游戏记录</p><h1>我的成长手册<span>。</span></h1></div><button className={styles.addButton} onClick={() => edit("new")} disabled={locked}><Plus size={16} /> 添加孩子</button></div>

    <div className={styles.profileSwitcher}><label htmlFor="explorer-profile">当前档案</label><span className={styles.selectWrap}><select id="explorer-profile" value={profile.id} disabled={locked} onChange={event => { selectProfile(event.target.value); setEditing(null); }}>{progress.profiles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.age}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></div>

    {editing && <form className={styles.profileForm} onSubmit={submit} aria-labelledby="profile-form-title"><fieldset disabled={locked} className={styles.formLock}>
      <div className={styles.formHeading}><h2 id="profile-form-title">{editing === "new" ? "添加孩子档案" : "编辑孩子档案"}</h2><p>为每个孩子分别保存游戏记录</p></div>
      <div className={styles.formFields}><div><label htmlFor="explorer-name">昵称 <span>最多 12 个字</span></label><input id="explorer-name" value={name} onChange={event => setName(event.target.value)} placeholder="输入孩子的昵称" maxLength={12} required autoComplete="off" /></div><div><label htmlFor="explorer-age">年龄段</label><span className={styles.selectWrap}><select id="explorer-age" value={age} onChange={event => setAge(event.target.value as AgeGroup)}>{AGE_GROUPS.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></div></div>
      <fieldset className={styles.avatarField}><legend>选择头像</legend><div className={styles.avatarChoices}>{(["seed", "planet", "cloud"] as const).map(item => <button type="button" key={item} className={avatar === item ? styles.avatarSelected : ""} aria-label={`${avatarNames[item]}头像`} aria-pressed={avatar === item} onClick={() => setAvatar(item)}><ExplorerAvatar kind={item} /><span>{avatarNames[item]}</span>{avatar === item && <i><Check size={11} /></i>}</button>)}</div></fieldset>
      <div className={styles.formActions}><button type="submit" className={styles.saveButton} disabled={!name.trim() || locked}>{locked ? "正在保存…" : "保存档案"} <Check size={15} /></button><button type="button" className={styles.cancelButton} onClick={() => setEditing(null)} disabled={locked}>取消</button></div>
    </fieldset></form>}

    <section className={styles.profileCard} aria-label="当前孩子档案"><ExplorerAvatar kind={profile.avatar} className={styles.profileAvatar} /><div className={styles.profileIdentity}><span>{profile.age} · 科学游戏档案</span><h2>{profile.name}</h2></div><button className={styles.editButton} onClick={() => edit("edit")} disabled={locked} aria-label="编辑当前孩子档案"><Pencil size={16} /><span>编辑档案</span></button></section>
    <section className={styles.growthStats} aria-label="游戏积分统计"><div><strong>{stats.weekPoints}<small> 分</small></strong><span>本周积分</span></div><div><strong>{stats.totalPoints}<small> 分</small></strong><span>累计积分</span></div><div><strong>{stats.topics}<small> 个</small></strong><span>玩过的主题</span></div><Link href="/games/leaderboard">查看周榜 <ArrowRight size={15} /></Link></section>

    <div className={styles.sectionHeading}><h2>主题徽章</h2><span>完成一次游戏，即可收集</span></div>
    <section className={styles.badgeGrid} aria-label="已开放游戏的主题徽章">{availableGames.map(game => {
      const unlocked = records.some(record => record.gameId === game.id);
      const Icon = topicIcons[game.id];
      return <Link href={`/games/play/${game.id}`} key={game.id} className={`${styles.badgeItem} ${styles[`theme_${game.id}`]} ${unlocked ? styles.badgeUnlocked : styles.badgeLocked}`}><span className={styles.badgeArtwork}><Icon size={29} strokeWidth={1.7} />{unlocked && <i><Check size={10} /></i>}</span><strong>{game.topic}</strong><span className={styles.badgeStatus}>{unlocked ? "已收集" : "去收集"}<ArrowRight size={12} /></span></Link>;
    })}</section>

    <div className={styles.sectionHeading}><h2>最近记录</h2><span>{records.length ? `共 ${records.length} 次完成` : "还没有完成记录"}</span></div>
    <section className={styles.history} aria-label="最近完成的游戏">{records.length ? records.slice(0, 12).map(record => {
      const game = SCIENCE_GAMES.find(item => item.id === record.gameId);
      const Icon = topicIcons[record.gameId];
      return <div key={record.id} className={styles.historyRow}><span className={`${styles.historyIcon} ${styles[`theme_${record.gameId}`]}`}><Icon size={18} strokeWidth={1.6} /></span><span className={styles.historyTitle}><strong>{game?.title ?? "科学游戏"}</strong><time dateTime={record.completedAt}>{new Date(record.completedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" })}</time></span><strong className={styles.recordPoints}>+{record.points}<small> 分</small></strong></div>;
    }) : <div className={styles.empty}><span><Magnet size={21} strokeWidth={1.6} /></span><div><h3>从一场游戏开始</h3><p>完成游戏后，这里会记录主题和积分。</p></div><Link href="/games">去玩游戏 <ArrowRight size={15} /></Link></div>}</section>
    <AccountRecords />
    <p className={styles.storageNote}>{recordSource === "account" ? "当前显示账号手册。正式积分以服务端确认的完成记录为准。" : "当前显示本机手册。清除浏览器数据后，本机记录不会保留。"}</p>
  </div>;
}
