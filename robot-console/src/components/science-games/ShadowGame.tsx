"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Move, RotateCcw } from "lucide-react";
import { createShadowWorld, SHADOW_ROUNDS, type ShadowState } from "@/lib/science-games/shadow-world";
import { useGameReward } from "./useGameReward";
import styles from "./ShadowGame.module.css";

const initialState: ShadowState = { round: 0, matched: false, complete: false, selected: "ball", message: "拖动小球，让墙上的影子填进橙色框。" };

export function ShadowGame() {
  const { reward, pending, award, clearReward } = useGameReward("shadow");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<ReturnType<typeof createShadowWorld> | null>(null);
  const [state, setState] = useState(initialState);
  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;
    let completed = false;
    worldRef.current = createShadowWorld(canvasRef.current, next => {
      if (disposed) return;
      setState(next);
      if (next.complete && !completed) { completed = true; award(); }
      if (!next.complete && next.round === 0) completed = false;
    });
    return () => { disposed = true; worldRef.current?.destroy(); worldRef.current = null; };
  }, [award]);

  function reset() { clearReward(); worldRef.current?.reset(); }

  return <section className={styles.game}>
    <div className={styles.topline}><div><p className={styles.kicker}>动手实验 · 03</p><h1>影子工坊</h1></div><button type="button" className={styles.reset} onClick={reset} aria-label="重新开始影子工坊" title="重新开始"><RotateCcw size={19} strokeWidth={1.7} /></button></div>
    <p className={styles.subtitle}>一束光，一个小球。让影子填进墙上的橙色框。</p>
    <div className={styles.rounds} aria-label={`第 ${state.round + 1} 关，共 ${SHADOW_ROUNDS.length} 关`}><span>{String(state.round + 1).padStart(2, "0")} / 03</span><strong>{SHADOW_ROUNDS[state.round].title}</strong><div aria-hidden="true">{SHADOW_ROUNDS.map((round, i) => <i key={round.title} data-done={i < state.round || i === state.round && state.matched} />)}</div></div>
    <div className={styles.scene}><canvas ref={canvasRef} className={styles.canvas} width={560} height={460} tabIndex={0} aria-label="影子实验台：左边可上下滑动灯光，中间可拖动小球，右侧墙面显示影子与橙色目标框" aria-describedby="shadow-help" /></div>
    <p className={styles.feedback} role="status" data-matched={state.matched}>{state.matched ? <Check size={17} /> : <Move size={17} strokeWidth={1.5} />}<span>{state.message}</span></p>
    {state.matched && !state.complete && <button type="button" className={styles.next} onClick={() => worldRef.current?.next()}>试试下一个影子 <ArrowRight size={17} /></button>}
    {pending && <p role="status">三个影子都对准了，正在保存记录…</p>}
    {reward && <div className={styles.result}><div><span>三个影子，都对准了</span><strong>{reward.pending ? "待同步" : reward.confirmed ? "已同步" : <>+{reward.points}<small> 分</small></>}</strong><p>{reward.reason}</p></div><div className={styles.resultActions}><button type="button" onClick={reset}>再玩一次 <RotateCcw size={15} /></button><Link href="/games">玩别的实验 <ArrowRight size={15} /></Link></div></div>}
    <div className={styles.hint}><span>动手试试</span><p>把小球往灯边挪，影子会变大；往墙边挪，影子会变小。也可以上下移动灯，看看影子走向哪里。</p></div>
    <details className={styles.keyboard}><summary>键盘操作</summary><p id="shadow-help">聚焦实验台后，按 1 选择小球、按 2 选择灯光，用方向键移动。橙色框是目标；对准后停留片刻即可完成这一关。</p></details>
    <p className={styles.note}>这是从侧面观察光路的简化实验，使用点光源和不透明小球。</p>
  </section>;
}
