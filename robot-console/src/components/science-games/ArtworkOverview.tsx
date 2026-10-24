"use client";

import { useState } from "react";
import { Check, Copy, ImageIcon } from "lucide-react";
import { ART_BASE, ART_STYLE, GAME_ARTWORK, artworkPrompt } from "@/lib/science-games/artwork";
import { useGameProgress } from "./GameProvider";
import { GameArt } from "./GameArt";
import styles from "./ScienceGames.module.css";

export function ArtworkOverview() {
  const { artworkIds } = useGameProgress();
  const [filter, setFilter] = useState("首批");
  const [copied, setCopied] = useState("");
  const firstBatch = GAME_ARTWORK.filter(asset => asset.priority === "首批");
  const assets = GAME_ARTWORK.filter(asset => filter === "全部" || asset.priority === filter);
  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); }
    catch { setCopied("复制失败，请展开提示词手动复制"); }
  }
  return <>
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}><ImageIcon size={15} /> 美术制作工作台</p><h1>科学乐园 · 素材参考</h1><p className={styles.pageSubtitle}>早期图片方案：首批 {firstBatch.length} 张，全部 {GAME_ARTWORK.length} 个素材位。新版动手游戏已使用可缩放插画与实验场景，无需先生成这些图片即可游玩。</p></div></div>
    <section className={styles.artInstructions}><h2>图片制作参考</h2><p>以下保留早期美术清单供参考。新版首页与游戏场景采用纸色、墨蓝、珊瑚橙；如果继续制作图片，请先按当前画面统一风格。实验道具贴图需单独接入，放入文件夹不会自动替换物理场景。</p><p>{ART_STYLE}</p><p>每个文件单独生成；透明图必须有真实透明通道。图片里不放标题、分数和按钮。</p><button className={styles.secondaryButton} onClick={() => copy("style", ART_STYLE)}><Copy size={16} /> {copied === "style" ? "已复制画风要求" : "复制早期画风参考"}</button></section>
    <div className={styles.ageTabs} role="group" aria-label="素材优先级">{["首批", "后续", "全部"].map(item => <button key={item} onClick={() => setFilter(item)} aria-pressed={filter === item} className={filter === item ? styles.tabActive : ""}>{item}</button>)}</div>
    <p role="status" className={styles.secondaryText}>{copied.startsWith("复制失败") ? copied : `素材文件已就绪 ${artworkIds.length} / ${GAME_ARTWORK.length} 张`}</p>
    <section className={styles.artworkGrid}>{assets.map(asset => <article key={asset.id} className={styles.artworkCard}><div className={styles.artworkPreview} data-transparent={asset.transparent}><GameArt id={asset.id} decorative /><span className={styles.artworkStatus}>{artworkIds.includes(asset.id) ? <><Check size={13} /> 已接入</> : "程序占位"}</span></div><div className={styles.artworkInfo}><span className={styles.eyebrow}>{asset.group} · {asset.priority}</span><h2>{asset.name}</h2><p>{asset.width} × {asset.height} px · {asset.transparent ? "透明 PNG" : "完整背景 PNG"}</p><code>{asset.file}</code><details><summary>查看生成提示词</summary><p className={styles.prompt}>{artworkPrompt(asset)}</p></details><button className={styles.secondaryButton} onClick={() => copy(asset.id, artworkPrompt(asset))}><Copy size={15} />{copied === asset.id ? "已复制" : "复制完整提示词"}</button><small>网站路径：{ART_BASE}{asset.file}</small></div></article>)}</section>
  </>;
}
