export type ShadowPoint = { x: number; y: number };
export const SHADOW_SCENE = { width: 560, height: 460, screen: 496, radius: 22 };
export const SHADOW_ROUNDS = [
  { title: "把影子变大", center: 245, halfHeight: 68, discovery: "小球靠近灯光，影子就会变大。" },
  { title: "把影子变小", center: 190, halfHeight: 38, discovery: "小球远离灯光、靠近墙面，影子就会变小。" },
  { title: "送影子到下面", center: 320, halfHeight: 78, discovery: "移动灯和小球，还能改变影子的位置。" },
] as const;

/** Intersect the two tangent rays from a point light with a vertical screen. */
export function projectShadow(light: ShadowPoint, ball: ShadowPoint, radius = SHADOW_SCENE.radius, screen = SHADOW_SCENE.screen) {
  const dx = ball.x - light.x;
  const dy = ball.y - light.y;
  if (radius <= 0 || dx <= radius || screen <= ball.x || ![dx, dy, radius, screen].every(Number.isFinite)) return null;
  const denominator = dx * dx - radius * radius;
  const tangent = radius * Math.sqrt(dx * dx + dy * dy - radius * radius);
  const top = light.y + (screen - light.x) * (dx * dy - tangent) / denominator;
  const bottom = light.y + (screen - light.x) * (dx * dy + tangent) / denominator;
  const pointOnTangent = (y: number) => {
    const slope = (y - light.y) / (screen - light.x);
    const along = (dx + slope * dy) / (1 + slope * slope);
    return { x: light.x + along, y: light.y + along * slope };
  };
  return { top, bottom, center: (top + bottom) / 2, halfHeight: (bottom - top) / 2, tangentTop: pointOnTangent(top), tangentBottom: pointOnTangent(bottom) };
}

export function shadowMatches(light: ShadowPoint, ball: ShadowPoint, round: number) {
  const projection = projectShadow(light, ball);
  const target = SHADOW_ROUNDS[round];
  return !!projection && !!target && Math.abs(projection.center - target.center) < 13 && Math.abs(projection.halfHeight - target.halfHeight) < Math.max(8, target.halfHeight * .15);
}

export type ShadowState = { round: number; matched: boolean; complete: boolean; message: string; selected: "ball" | "light" };

export function createShadowWorld(canvas: HTMLCanvasElement, onState: (state: ShadowState) => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("这个浏览器暂时无法打开影子实验台");
  const light = { x: 70, y: 250 };
  const ball = { x: 326, y: 305 };
  let round = 0;
  let matched = false;
  let held: "ball" | "light" | null = null;
  let selected: "ball" | "light" = "ball";
  let pointer: number | null = null;
  let offset = { x: 0, y: 0 };
  let matchingSince = 0;
  let lastState = "";
  let frame = 0;
  let destroyed = false;
  let paused = false;
  let lastInput = "拖动小球，让墙上的影子填进橙色框。";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");

  function emit() {
    const state: ShadowState = { round, matched, complete: round === SHADOW_ROUNDS.length - 1 && matched, message: lastInput, selected };
    const signature = JSON.stringify(state);
    if (signature !== lastState) { lastState = signature; onState(state); }
    canvas.dataset.round = String(round + 1);
    canvas.dataset.matched = String(matched);
    canvas.dataset.complete = String(state.complete);
    canvas.dataset.held = held ?? "";
  }
  function position(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 560, y: (event.clientY - rect.top) / rect.height * 460 };
  }
  function place(which: "ball" | "light", p: ShadowPoint) {
    if (![p.x, p.y].every(Number.isFinite) || matched) return;
    if (which === "ball") { ball.x = Math.max(171, Math.min(399, p.x)); ball.y = Math.max(104, Math.min(388, p.y)); }
    else light.y = Math.max(104, Math.min(386, p.y));
    selected = which;
    const shadow = projectShadow(light, ball)!;
    const target = SHADOW_ROUNDS[round];
    if (Math.abs(shadow.halfHeight - target.halfHeight) > Math.max(8, target.halfHeight * .15)) lastInput = shadow.halfHeight < target.halfHeight ? "影子还小一点，把小球往灯光靠近。" : "影子有点大，把小球往墙面靠近。";
    else if (shadow.center < target.center - 13) lastInput = "大小差不多了，把小球轻轻往下移。";
    else if (shadow.center > target.center + 13) lastInput = "大小差不多了，把小球轻轻往上移。";
    else lastInput = "对准了！松手，观察一下影子。";
    emit();
  }
  function end() {
    const captured = pointer;
    pointer = null; held = null;
    if (captured !== null) { try { if (canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured); } catch { /* The browser may already have revoked this pointer. */ } }
    emit();
  }
  function down(event: PointerEvent) {
    if (pointer !== null || matched || (event.pointerType === "mouse" && event.button !== 0)) return;
    const p = position(event);
    const which = Math.hypot(p.x - ball.x, p.y - ball.y) < 45 ? "ball" : Math.hypot(p.x - light.x, p.y - light.y) < 45 ? "light" : null;
    if (!which) return;
    paused = false;
    event.preventDefault();
    canvas.focus({ preventScroll: true }); held = which; selected = which; pointer = event.pointerId;
    const origin = which === "ball" ? ball : light;
    offset = { x: p.x - origin.x, y: p.y - origin.y };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Window release handlers also end a gesture. */ }
    lastInput = which === "ball" ? "左右移动改变大小，上下移动改变位置。" : "上下移动灯光，看看影子往哪边走。"; emit();
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer || !held) return;
    if (event.pointerType === "mouse" && event.buttons === 0) { end(); return; }
    event.preventDefault(); const p = position(event); place(held, { x: p.x - offset.x, y: p.y - offset.y });
  }
  function up(event: PointerEvent) { if (event.pointerId === pointer) end(); }
  function pause() { paused = true; matchingSince = 0; end(); }
  function resume() { paused = false; matchingSince = 0; }
  function visibility() { if (document.hidden) pause(); else resume(); }
  function key(event: KeyboardEvent) {
    if (event.key === "1" || event.key === "2") { event.preventDefault(); selected = event.key === "1" ? "ball" : "light"; lastInput = `已选择${selected === "ball" ? "小球" : "灯光"}，用方向键移动。`; emit(); return; }
    const delta: Record<string, ShadowPoint> = { ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 }, ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 } };
    if (delta[event.key]) { event.preventDefault(); const origin = selected === "ball" ? ball : light; place(selected, { x: origin.x + delta[event.key].x, y: origin.y + delta[event.key].y }); }
  }
  function resetPositions() { light.y = 250; ball.x = 326; ball.y = 305; selected = "ball"; matchingSince = 0; matched = false; lastInput = "拖动小球，让墙上的影子填进橙色框。"; }
  function rounded(x: number, y: number, w: number, h: number, r: number) { ctx!.beginPath(); ctx!.roundRect(x, y, w, h, r); }
  function resize() { const ratio = Math.min(devicePixelRatio || 1, 2); const width = canvas.getBoundingClientRect().width; canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(width / 560 * 460 * ratio)); }
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  function draw(time: number) {
    if (!ctx) return;
    ctx.setTransform(canvas.width / 560, 0, 0, canvas.height / 460, 0, 0);
    ctx.clearRect(0, 0, 560, 460);
    const fill = ctx.createLinearGradient(0, 0, 560, 460); fill.addColorStop(0, "#28384a"); fill.addColorStop(1, "#1a2537"); ctx.fillStyle = fill; ctx.fillRect(0, 0, 560, 460);
    ctx.strokeStyle = "#ffffff08"; ctx.lineWidth = 1; for (let x = 130; x < 480; x += 28) { ctx.beginPath(); ctx.moveTo(x, 65); ctx.lineTo(x, 419); ctx.stroke(); }
    const shadow = projectShadow(light, ball)!;
    // Point-light cone; an opaque blocker removes the ray interval behind it.
    const beam = ctx.createLinearGradient(light.x, 0, 496, 0); beam.addColorStop(0, "#ffdc7e40"); beam.addColorStop(1, "#ffefba13");
    ctx.save(); ctx.beginPath(); ctx.rect(0, 65, 496, 354); ctx.clip();
    ctx.beginPath(); ctx.moveTo(light.x, light.y); ctx.lineTo(496, 63); ctx.lineTo(496, 422); ctx.closePath(); ctx.fillStyle = beam; ctx.fill();
    // The visible occlusion and the target check share the same tangent rays.
    ctx.beginPath(); ctx.moveTo(shadow.tangentTop.x, shadow.tangentTop.y); ctx.lineTo(496, shadow.top); ctx.lineTo(496, shadow.bottom); ctx.lineTo(shadow.tangentBottom.x, shadow.tangentBottom.y); ctx.closePath(); ctx.fillStyle = "#111b2bbb"; ctx.fill();
    ctx.strokeStyle = "#f7d88a2c"; ctx.setLineDash([4, 7]); ctx.beginPath(); ctx.moveTo(light.x, light.y); ctx.lineTo(496, shadow.top); ctx.moveTo(light.x, light.y); ctx.lineTo(496, shadow.bottom); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    rounded(482, 63, 43, 359, 10); ctx.fillStyle = "#d9d5c5"; ctx.fill(); ctx.strokeStyle = "#f3ebd4"; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); rounded(485, 66, 37, 353, 8); ctx.clip(); ctx.fillStyle = "#263245cc"; ctx.fillRect(485, shadow.top, 37, shadow.bottom - shadow.top); ctx.restore();
    const target = SHADOW_ROUNDS[round]; rounded(479, target.center - target.halfHeight, 49, target.halfHeight * 2, 9); ctx.strokeStyle = matched ? "#a5d1ba" : "#f5a276"; ctx.lineWidth = 3; ctx.setLineDash(matched ? [] : [6, 5]); ctx.stroke(); ctx.setLineDash([]);
    // Rail and sliding light source.
    ctx.strokeStyle = "#657084"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(58, 89); ctx.lineTo(58, 395); ctx.stroke();
    for (let y = 100; y < 393; y += 16) { ctx.strokeStyle = "#556276"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(46, y); ctx.lineTo(53, y); ctx.stroke(); }
    ctx.save(); ctx.translate(light.x, light.y); ctx.shadowColor = "#ffda78"; ctx.shadowBlur = motion.matches ? 12 : 15 + Math.sin(time * .002) * 3;
    rounded(-26, -25, 45, 50, 10); ctx.fillStyle = "#d88d4c"; ctx.fill(); ctx.shadowBlur = 0;
    rounded(-24, -26, 40, 46, 9); ctx.fillStyle = "#eac171"; ctx.fill(); rounded(10, -18, 13, 34, 4); ctx.fillStyle = "#fff0b8"; ctx.fill();
    ctx.strokeStyle = "#9f6e3c"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(-7, -12); ctx.moveTo(-15, -4); ctx.lineTo(-7, -4); ctx.moveTo(-15, 4); ctx.lineTo(-7, 4); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(ball.x, ball.y); ctx.shadowColor = "#0d142bcc"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 8;
    const sphere = ctx.createRadialGradient(-8, -9, 1, 0, 0, 25); sphere.addColorStop(0, "#f9ad88"); sphere.addColorStop(.55, "#e77b58"); sphere.addColorStop(1, "#a94c3b"); ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fillStyle = sphere; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = held === "ball" ? "#ffe5bd" : "#f5ba8e77"; ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 33, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    if (matchingSince && !matched) { const amount = Math.min(1, (time - matchingSince) / 650); ctx.beginPath(); ctx.arc(ball.x, ball.y, 35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * amount); ctx.strokeStyle = "#a5d1ba"; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.textAlign = "left";
  }
  function loop(time: number) {
    if (destroyed) return;
    if (!document.hidden) {
      if (!paused && !held && !matched && shadowMatches(light, ball, round)) {
        matchingSince ||= time;
        if (time - matchingSince >= 650) { matched = true; matchingSince = 0; lastInput = SHADOW_ROUNDS[round].discovery; emit(); }
      } else matchingSince = 0;
      draw(time);
    }
    frame = requestAnimationFrame(loop);
  }
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("lostpointercapture", up); canvas.addEventListener("keydown", key);
  window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); window.addEventListener("blur", pause); window.addEventListener("pagehide", pause); window.addEventListener("focus", resume); window.addEventListener("pageshow", resume); document.addEventListener("visibilitychange", visibility);
  frame = requestAnimationFrame(loop); emit();
  return {
    reset() { if (destroyed) return; end(); round = 0; resetPositions(); emit(); },
    next() { if (destroyed || !matched || round >= SHADOW_ROUNDS.length - 1) return; end(); round++; resetPositions(); emit(); },
    destroy() { if (destroyed) return; destroyed = true; cancelAnimationFrame(frame); observer.disconnect(); end(); canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("lostpointercapture", up); canvas.removeEventListener("keydown", key); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); window.removeEventListener("blur", pause); window.removeEventListener("pagehide", pause); window.removeEventListener("focus", resume); window.removeEventListener("pageshow", resume); document.removeEventListener("visibilitychange", visibility); },
  };
}
