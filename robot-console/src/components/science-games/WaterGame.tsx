"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, Hand, RotateCcw, Waves } from "lucide-react";
import { WATER_OBJECTS, WATER_SCENE, createWaterWorld, submergedFraction, type WaterItem, type WaterObjectId, type WaterWorld } from "@/lib/science-games/water-world";
import { useGameReward } from "./useGameReward";
import styles from "./WaterGame.module.css";

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
}

function releasePointer(canvas: HTMLCanvasElement, pointerId: number | null) {
  if (pointerId === null) return;
  // Mobile browsers may revoke capture before sending a cancellation event.
  try { if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); }
  catch { /* The interaction is already over when the browser removes capture. */ }
}

function drawObject(ctx: CanvasRenderingContext2D, item: WaterItem) {
  const { body, id } = item;
  ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
  ctx.shadowColor = "rgba(29, 52, 61, .17)"; ctx.shadowBlur = item.held ? 18 : 8; ctx.shadowOffsetY = item.held ? 12 : 4;
  if (id === "wood") {
    const fill = ctx.createLinearGradient(-39, -29, 39, 29); fill.addColorStop(0, "#e9c492"); fill.addColorStop(1, "#be8e52");
    rounded(ctx, -39, -29, 78, 58, 7); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = "transparent";
    rounded(ctx, -35, -25, 70, 50, 5); ctx.strokeStyle = "#f3d7ac"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); rounded(ctx, -37, -27, 74, 54, 5); ctx.clip();
    ctx.strokeStyle = "rgba(126, 83, 39, .24)"; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-45, -22 + i * 10); ctx.bezierCurveTo(-6, -30 + i * 10, 3, -10 + i * 10, 45, -20 + i * 10); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(15, 5, 9, 4, .1, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(15, 5, 4, 1.8, .1, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  } else if (id === "steel") {
    const fill = ctx.createRadialGradient(-10, -11, 2, 0, 0, 31); fill.addColorStop(0, "#ffffff"); fill.addColorStop(.2, "#e6edf1"); fill.addColorStop(.55, "#a9bbc8"); fill.addColorStop(.81, "#617887"); fill.addColorStop(1, "#a2b2bd");
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#768c99"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-9, -12, 8, 5, -.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.63)"; ctx.fill();
  } else if (id === "clay-ball") {
    const fill = ctx.createRadialGradient(-11, -15, 2, 0, 0, 34); fill.addColorStop(0, "#edb095"); fill.addColorStop(.6, "#d18a6d"); fill.addColorStop(1, "#ac644f");
    ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(161,86,65,.25)"; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-6 + i * 4, -10 + i * 5, 15, 4, -.3, .3, 2.5); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(-8, -14, 10, 5, -.4, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,223,202,.24)"; ctx.fill();
  } else {
    const fill = ctx.createLinearGradient(0, -25, 0, 30); fill.addColorStop(0, "#e7a58a"); fill.addColorStop(.5, "#cb8266"); fill.addColorStop(1, "#ad624d");
    ctx.beginPath(); ctx.moveTo(-55, -22); ctx.quadraticCurveTo(-49, 15, -26, 26); ctx.quadraticCurveTo(0, 32, 26, 26); ctx.quadraticCurveTo(49, 15, 55, -22); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = "transparent";
    ctx.beginPath(); ctx.ellipse(0, -19, 55, 14, 0, 0, Math.PI * 2); ctx.fillStyle = "#edb096"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -20, 44, 8.5, 0, 0, Math.PI * 2); ctx.fillStyle = "#a95f4b"; ctx.fill();
    const inside = ctx.createLinearGradient(0, -27, 0, -12); inside.addColorStop(0, "#b67055"); inside.addColorStop(1, "#d59174");
    ctx.beginPath(); ctx.ellipse(0, -19, 40, 6.5, 0, 0, Math.PI * 2); ctx.fillStyle = inside; ctx.fill();
    ctx.strokeStyle = "rgba(247,198,172,.47)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-39, 1); ctx.quadraticCurveTo(0, 19, 39, 1); ctx.stroke();
  }
  if (item.held) { ctx.shadowColor = "transparent"; ctx.setLineDash([4, 5]); ctx.strokeStyle = "#eaa37f"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, id === "clay-boat" ? 65 : 49, 43, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, world: WaterWorld, time: number, reducedMotion: boolean) {
  const { width, height, surface, bottom, left, right } = WATER_SCENE;
  ctx.clearRect(0, 0, width, height);
  const background = ctx.createLinearGradient(0, 0, 0, height); background.addColorStop(0, "#f0f7f5"); background.addColorStop(1, "#e2efec"); ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  for (const object of WATER_OBJECTS) {
    const home = object.home;
    ctx.fillStyle = "rgba(81,134,128,.12)"; ctx.beginPath(); ctx.ellipse(home.x, 174, object.id === "clay-boat" ? 56 : 41, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5d7774"; ctx.textAlign = "center"; ctx.font = "500 12px 'Microsoft YaHei', sans-serif"; ctx.fillText(object.name, home.x, 207);
    if (object.id.startsWith("clay")) { ctx.fillStyle = "#7e9290"; ctx.font = "10px 'Microsoft YaHei', sans-serif"; ctx.fillText("同样多的橡皮泥", home.x, 223); }
  }
  // The empty tank has a slightly inset glass rim and a soft contact shadow.
  ctx.shadowColor = "rgba(45, 83, 90, .12)"; ctx.shadowBlur = 15; ctx.shadowOffsetY = 10;
  rounded(ctx, left - 7, surface - 24, right - left + 14, bottom - surface + 34, 21); ctx.fillStyle = "#e2eff0"; ctx.fill(); ctx.shadowColor = "transparent";
  ctx.save(); rounded(ctx, left, surface - 18, right - left, bottom - surface + 18, 15); ctx.clip();
  ctx.fillStyle = "#eef5f2"; ctx.fillRect(left, surface - 18, right - left, bottom - surface + 20);
  const water = ctx.createLinearGradient(0, surface, 0, bottom); water.addColorStop(0, "#b7e1e3"); water.addColorStop(.4, "#97cfd8"); water.addColorStop(1, "#78b7ca");
  ctx.fillStyle = water; ctx.fillRect(left, surface, right - left, bottom - surface);
  ctx.strokeStyle = "rgba(239,255,251,.28)"; ctx.lineWidth = 1;
  for (let y = 304; y < bottom; y += 45) {
    ctx.beginPath(); ctx.moveTo(42, y); ctx.bezierCurveTo(170, y - 9, 280, y + 9, 515, y - 2); ctx.stroke();
  }
  ctx.restore();
  // Markings are engraved on the glass rather than drawn as a HUD.
  ctx.strokeStyle = "rgba(47,105,122,.24)"; ctx.fillStyle = "#6b99a1"; ctx.lineWidth = 1; ctx.textAlign = "right"; ctx.font = "9px sans-serif";
  for (let y = 295; y < 455; y += 27) { ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(y % 2 ? 55 : 50, y); ctx.stroke(); }
  for (const item of world.items) drawObject(ctx, item);
  // A translucent underwater pass makes the waterline readable on every material.
  ctx.save(); ctx.beginPath(); ctx.rect(left, surface, right - left, bottom - surface); ctx.clip();
  for (const item of world.items) {
    if (submergedFraction(item.body.bounds.min.y, item.body.bounds.max.y, surface) === 0) continue;
    ctx.save(); ctx.translate(item.body.position.x, item.body.position.y); ctx.rotate(item.body.angle); ctx.fillStyle = "rgba(74,163,185,.18)";
    if (item.id === "wood") rounded(ctx, -39, -29, 78, 58, 7);
    else if (item.id === "clay-boat") { ctx.beginPath(); ctx.moveTo(-55, -22); ctx.quadraticCurveTo(-49, 15, -26, 26); ctx.quadraticCurveTo(0, 32, 26, 26); ctx.quadraticCurveTo(49, 15, 55, -22); ctx.closePath(); }
    else { ctx.beginPath(); ctx.arc(0, 0, item.id === "steel" ? 28 : 29, 0, Math.PI * 2); }
    ctx.fill(); ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(244,255,253,.83)"; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let x = left; x <= right; x += 4) {
    const wave = reducedMotion ? 0 : Math.sin(x / 30 + time / 700) * 1.5;
    if (x === left) ctx.moveTo(x, surface + wave); else ctx.lineTo(x, surface + wave);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.65)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(left + 7, surface + 12); ctx.lineTo(left + 7, bottom - 13); ctx.quadraticCurveTo(left + 7, bottom - 7, left + 14, bottom - 7); ctx.lineTo(right - 15, bottom - 7); ctx.stroke();
  ctx.strokeStyle = "rgba(69,126,139,.23)"; ctx.lineWidth = 1; rounded(ctx, left - 7, surface - 24, right - left + 14, bottom - surface + 34, 21); ctx.stroke();
  if (!world.items.some(item => !item.body.isStatic)) {
    ctx.textAlign = "center"; ctx.fillStyle = "#4c8392"; ctx.font = "500 15px 'Microsoft YaHei', sans-serif"; ctx.fillText("把上面的物体拖进水里", width / 2, 363);
    ctx.strokeStyle = "#75a7af"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(280, 302); ctx.lineTo(280, 330); ctx.lineTo(274, 324); ctx.moveTo(280, 330); ctx.lineTo(286, 324); ctx.stroke();
  }
}

export function WaterGame() {
  const { reward, pending, award, clearReward } = useGameReward("water");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<WaterWorld | null>(null);
  const completedRef = useRef(false);
  const observedRef = useRef(new Set<WaterObjectId>());
  const pointerRef = useRef<number | null>(null);
  const keyboardRef = useRef<WaterObjectId | null>(null);
  const endInteractionRef = useRef<((interrupted?: boolean) => void) | null>(null);
  const [observed, setObserved] = useState<WaterObjectId[]>([]);
  const [notice, setNotice] = useState("把物体拖进水槽，松手后观察它停在哪里。");
  const [noticeKind, setNoticeKind] = useState<"hint" | "holding" | "observed">("hint");
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const world = createWaterWorld(id => {
      if (observedRef.current.has(id)) return;
      observedRef.current.add(id);
      setObserved([...observedRef.current]);
      const object = WATER_OBJECTS.find(item => item.id === id)!;
      setNotice(`${object.name}${object.result}。${id === "wood" || id === "clay-boat" ? "它停在水面附近。" : "它落到了水槽底部。"}`);
      setNoticeKind("observed");
      if (observedRef.current.size === WATER_OBJECTS.length && !completedRef.current) {
        completedRef.current = true;
        award();
      }
    });
    worldRef.current = world;
    let animation = 0;
    let lastTime = 0;
    let accumulator = 0;
    let disposed = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motion.matches;
    const updateMotion = () => { reducedMotion = motion.matches; };
    motion.addEventListener("change", updateMotion);
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, canvas.getBoundingClientRect().width);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(width / WATER_SCENE.width * WATER_SCENE.height * ratio);
      ctx.setTransform(canvas.width / WATER_SCENE.width, 0, 0, canvas.height / WATER_SCENE.height, 0, 0);
      drawScene(ctx, world, performance.now(), reducedMotion);
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const frame = (time: number) => {
      if (disposed) return;
      if (document.hidden) { lastTime = 0; accumulator = 0; }
      else {
        accumulator += lastTime ? Math.min(time - lastTime, 60) : 1000 / 60;
        while (accumulator >= 1000 / 60) { world.update(1000 / 60); accumulator -= 1000 / 60; }
        lastTime = time;
        drawScene(ctx, world, time, reducedMotion);
      }
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    const position = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: (event.clientX - bounds.left) / bounds.width * WATER_SCENE.width, y: (event.clientY - bounds.top) / bounds.height * WATER_SCENE.height };
    };
    const endInteraction = (interrupted = false) => {
      const active = world.held;
      const pointerId = pointerRef.current;
      // Clear first: releasePointerCapture can synchronously fire lostpointercapture.
      pointerRef.current = null;
      keyboardRef.current = null;
      world.endDrag();
      releasePointer(canvas, pointerId);
      if (active && interrupted && !disposed) {
        setNotice("物体已松开。可以继续拖动，观察沉浮。");
        setNoticeKind("hint");
      }
    };
    endInteractionRef.current = endInteraction;
    const down = (event: PointerEvent) => {
      if (pointerRef.current !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
      const id = world.beginDrag(position(event));
      if (!id) return;
      event.preventDefault();
      pointerRef.current = event.pointerId;
      keyboardRef.current = null;
      try { canvas.setPointerCapture(event.pointerId); }
      catch { /* Window-level pointerup still releases the object if capture is unavailable. */ }
      setNotice(`拿起了${WATER_OBJECTS.find(item => item.id === id)!.name}，拖到水里再松手。`);
      setNoticeKind("holding");
    };
    const move = (event: PointerEvent) => {
      if (pointerRef.current !== event.pointerId) return;
      if (event.pointerType === "mouse" && event.buttons === 0) { endInteraction(true); return; }
      event.preventDefault(); world.moveDrag(position(event));
    };
    const up = (event: PointerEvent) => {
      if (pointerRef.current !== event.pointerId) return;
      const name = WATER_OBJECTS.find(item => item.id === world.held?.id)?.name;
      endInteraction();
      setNotice(event.type === "pointerup" ? `${name ?? "物体"}已松手，等它停稳后看看结果。` : "物体已松开，可以继续拖动。");
      setNoticeKind("hint");
    };
    const blur = () => { endInteraction(true); };
    const visibility = () => { lastTime = 0; accumulator = 0; if (document.hidden) endInteraction(true); };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); canvas.addEventListener("lostpointercapture", up);
    canvas.addEventListener("blur", blur);
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true; cancelAnimationFrame(animation); observer.disconnect(); motion.removeEventListener("change", updateMotion);
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("lostpointercapture", up);
      canvas.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", blur); window.removeEventListener("pagehide", blur);
      document.removeEventListener("visibilitychange", visibility);
      endInteraction(); endInteractionRef.current = null; world.destroy(); worldRef.current = null;
    };
  }, [award]);

  function reset() {
    endInteractionRef.current?.();
    worldRef.current?.reset();
    observedRef.current.clear(); completedRef.current = false; keyboardRef.current = null;
    setObserved([]); clearReward(); setNotice("水槽已复原。换个顺序，再拖进去试试。"); setNoticeKind("hint");
  }

  function keyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const world = worldRef.current;
    if (!world) return;
    const number = Number(event.key);
    if (number >= 1 && number <= WATER_OBJECTS.length) {
      event.preventDefault();
      endInteractionRef.current?.();
      const item = world.items[number - 1];
      world.beginDrag(item.body.position, item.id); keyboardRef.current = item.id;
      setNotice(`已拿起${WATER_OBJECTS[number - 1].name}，用方向键移动，空格键松手。`);
      setNoticeKind("holding");
    } else if (event.key.startsWith("Arrow") && keyboardRef.current && world.pointer) {
      event.preventDefault();
      const point = { ...world.pointer };
      if (event.key === "ArrowLeft") point.x -= 20;
      if (event.key === "ArrowRight") point.x += 20;
      if (event.key === "ArrowUp") point.y -= 20;
      if (event.key === "ArrowDown") point.y += 20;
      world.moveDrag(point);
    } else if ([" ", "Enter", "Escape"].includes(event.key) && keyboardRef.current) {
      event.preventDefault(); endInteractionRef.current?.(); setNotice("已松手，等物体停稳后观察沉浮。"); setNoticeKind("hint");
    }
  }

  return <section className={styles.game}>
    <div className={styles.topline}><div><p className={styles.eyebrow}>动手实验 · 02</p><h1>沉浮实验</h1></div><button type="button" className={styles.reset} onClick={reset} aria-label="重新摆放全部物体" title="重新摆放"><RotateCcw size={19} strokeWidth={1.7} /></button></div>
    <p className={styles.subtitle}>一池清水，四件小物。拖进去，看看会发生什么。</p>
    <div className={styles.scene}><canvas ref={canvasRef} className={styles.canvas} width={560} height={510} tabIndex={0} onKeyDown={keyDown} aria-label="可操作的沉浮实验水槽：上方从左到右为松木块、实心钢球、橡皮泥球、橡皮泥船，拖动它们放入下方水槽" aria-describedby="water-keyboard-help" /></div>
    <p className={styles.sceneCaption} data-state={noticeKind} role="status" aria-live="polite" aria-atomic="true">{noticeKind === "observed" ? <Check size={15} strokeWidth={1.8} aria-hidden="true" /> : <Hand size={15} strokeWidth={1.7} aria-hidden="true" />}<span>{notice}</span></p>
    <div className={styles.progress} aria-label={`已经观察 ${observed.length} 件，共 ${WATER_OBJECTS.length} 件`}><span className={styles.progressTitle}><Waves size={17} strokeWidth={1.7} /> 已观察 <strong>{observed.length} / {WATER_OBJECTS.length}</strong></span><div className={styles.dots} aria-hidden="true">{WATER_OBJECTS.map(object => <span className={styles.dot} key={object.id} data-complete={observed.includes(object.id)} />)}</div></div>
    <div className={styles.observations}>{WATER_OBJECTS.map(object => <div key={object.id} className={styles.observation}><span className={styles.material} data-kind={object.id} /><span className={styles.objectName}>{object.name}</span><span className={styles.observationResult} data-seen={observed.includes(object.id)}>{observed.includes(object.id) ? <><Check size={13} /> {object.result}</> : "等待放进水里"}</span></div>)}</div>
    {pending && <p role="status">四件物体都观察到了，正在保存记录…</p>}
    {reward && <div className={styles.completion}><div className={styles.reward} role="status"><div><strong>四件物体，都观察到了</strong>{reward.reason}</div><b>{reward.pending ? "待同步" : reward.confirmed ? "已同步" : `+${reward.points} 分`}</b></div><div className={styles.completionActions}><button type="button" onClick={reset}><RotateCcw size={15} /> 再玩一次</button><Link href="/games">玩别的实验 <ArrowRight size={15} /></Link></div></div>}
    {observed.includes("clay-ball") && observed.includes("clay-boat") && <p className={styles.discovery}><strong>换个形状，结果也会变。</strong>两件橡皮泥一样重。捏成船以后，船口朝上时能排开更多水，获得更大的浮力。</p>}
    <details className={styles.keyboard}><summary>键盘与辅助操作</summary><p id="water-keyboard-help">聚焦水槽后，按 1—4 拿起对应物体，方向键移动，空格键松手。也可使用下面的按钮把物体放入水中。</p><div className={styles.keyboardButtons}>{WATER_OBJECTS.map(object => <button type="button" key={object.id} onClick={() => { endInteractionRef.current?.(); worldRef.current?.drop(object.id); setNotice(`已把${object.name}放入水槽，请观察。`); setNoticeKind("hint"); }}>放入{object.name}</button>)}</div></details>
    <p className={styles.note}>这是浮力的简化模拟。使用干燥松木、实心钢球；橡皮泥船保持船口朝上，暂不模拟进水。</p>
  </section>;
}
