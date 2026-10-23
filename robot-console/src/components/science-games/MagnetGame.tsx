"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Hand, MoveDown, RotateCcw } from "lucide-react";
import { createMagnetWorld, MAGNET_TARGET, type MagnetState } from "@/lib/science-games/magnet-world";
import { useGameReward } from "./useGameReward";
import styles from "./MagnetGame.module.css";

const initialState: MagnetState = { collected: 0, attached: 0, dragging: false, message: "先靠近桌面铁件，吸住后再往上拖。" };

export function MagnetGame() {
  const { reward, pending, award, clearReward } = useGameReward("magnet");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<ReturnType<typeof createMagnetWorld> | null>(null);
  const [run, setRun] = useState(0);
  const [state, setState] = useState(initialState);
  useEffect(() => {
    if (!canvasRef.current) return;
    let completed = false;
    const world = createMagnetWorld(canvasRef.current, next => {
      setState(next);
      if (next.collected === MAGNET_TARGET && !completed) {
        completed = true;
        award();
      }
    });
    worldRef.current = world;
    return () => { world.destroy(); worldRef.current = null; };
  }, [run, award]);

  function reset() { worldRef.current?.destroy(); worldRef.current = null; clearReward(); setState(initialState); setRun(value => value + 1); }

  return <section className={styles.game}>
    <div className={styles.heading}><div><p className={styles.kicker}>动手实验 · 01</p><h1>磁力打捞<span>把小零件送回家</span></h1></div><button type="button" onClick={reset} className={styles.reset} aria-label="重新开始磁力打捞" title="重新开始"><RotateCcw size={19} strokeWidth={1.7} /></button></div>
    <div className={styles.playStatus}>
      <div className={styles.counter}><span>收集进度</span><strong>{state.collected}<small> / {MAGNET_TARGET}</small></strong><div className={styles.progress} aria-hidden="true">{Array.from({ length: MAGNET_TARGET }, (_, i) => <i key={i} data-filled={i < state.collected} />)}</div></div>
      <p className={styles.notice} role="status" aria-live="polite">{state.message}</p>
    </div>
    <div className={styles.layout}>
      <div className={styles.workbench}>
        <div className={styles.canvasFrame}><canvas key={run} ref={canvasRef} width={420} height={520} className={styles.canvas} tabIndex={0} aria-label="磁力实验台：拖动红色磁铁靠近下方铁件，吸起后送到左上收集盘并松手" aria-describedby="magnet-controls" /></div>
        <div className={styles.toolbar}><span><Hand size={16} aria-hidden="true" /> 拖动磁铁靠近铁件，送到左上托盘后松手</span><button type="button" onClick={() => worldRef.current?.release()} disabled={state.attached === 0}><MoveDown size={16} /> 放下</button></div>
      </div>
      <aside className={styles.aside}>
        {pending && <p role="status">打捞完成，正在保存记录…</p>}
        {reward ? <div className={styles.reward}><span className={styles.rewardPoints}>{reward.pending ? "待同步" : reward.confirmed ? "已同步" : <>+{reward.points}<small> 积分</small></>}</span><h2>全部打捞成功</h2><p>{reward.reason}</p><div className={styles.rewardActions}><button type="button" onClick={reset}><RotateCcw size={15} /> 再玩一次</button><Link href="/games">玩别的实验 <ArrowRight size={15} /></Link></div><Link className={styles.rankingLink} href="/games/leaderboard">去看看积分榜 <ArrowRight size={15} /></Link></div> : !pending && <div className={styles.instructions}><h2>怎么玩</h2><p><b>01</b> 抓住磁铁，靠近铁制小零件。</p><p><b>02</b> 吸住后，拖到左上方收集盘。</p><p><b>03</b> 松手，把零件留在盘子里。</p></div>}
        <div className={styles.discovery}><span>试着找一找</span><p>木块、塑料积木、铝罐，为什么没有被吸起来？</p></div>
        <details className={styles.keyboard}><summary>键盘操作</summary><p id="magnet-controls">聚焦实验台后，用方向键移动磁铁，空格或回车键放下零件。</p></details>
      </aside>
    </div>
  </section>;
}
