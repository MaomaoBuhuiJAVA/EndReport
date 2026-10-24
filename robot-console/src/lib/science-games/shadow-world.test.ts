import { afterEach, describe, expect, it, vi } from "vitest";
import { createShadowWorld, projectShadow, shadowMatches, SHADOW_ROUNDS, type ShadowPoint, type ShadowState } from "./shadow-world";

afterEach(() => { vi.unstubAllGlobals(); });

function pointerEvent(type: string, point: ShadowPoint, pointerId = 7) {
  return Object.assign(new Event(type, { cancelable: true }), {
    clientX: point.x, clientY: point.y, pointerId,
    pointerType: "touch", button: 0, buttons: type === "pointerup" ? 0 : 1,
  });
}

/** Only browser transport is mocked; input, projection, matching and rendering use the game. */
function shadowSession() {
  const fakeWindow = new EventTarget();
  const fakeDocument = Object.assign(new EventTarget(), { hidden: false });
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let now = 0;
  const gradient = { addColorStop() { return undefined; } };
  const context = new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (typeof key === "string" && key in target) return target[key];
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      return () => undefined;
    },
    set(target, key, value) { if (typeof key === "string") target[key] = value; return true; },
  });
  class FakeCanvas extends EventTarget {
    width = 560;
    height = 460;
    dataset: Record<string, string> = {};
    captures = new Set<number>();
    captureRevoked = false;
    getContext() { return context; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 560, height: 460 }; }
    focus() { return undefined; }
    setPointerCapture(id: number) { this.captures.add(id); }
    hasPointerCapture(id: number) { return this.captures.has(id); }
    releasePointerCapture(id: number) {
      this.captures.delete(id);
      if (this.captureRevoked) throw new Error("Pointer capture was revoked by the browser");
      this.dispatchEvent(pointerEvent("lostpointercapture", { x: 0, y: 0 }, id));
    }
  }
  const canvas = new FakeCanvas();
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("ResizeObserver", class { observe() { return undefined; } disconnect() { return undefined; } });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  const states: ShadowState[] = [];
  const world = createShadowWorld(canvas as unknown as HTMLCanvasElement, state => states.push(state));
  return {
    canvas, world, states, frames,
    get state() { return states[states.length - 1]; },
    advance(milliseconds: number) {
      now += milliseconds;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    },
    windowEvent(type: string) { fakeWindow.dispatchEvent(new Event(type)); },
    visibility(hidden: boolean) { fakeDocument.hidden = hidden; fakeDocument.dispatchEvent(new Event("visibilitychange")); },
    hold(from: ShadowPoint, to: ShadowPoint) {
      canvas.dispatchEvent(pointerEvent("pointerdown", from));
      canvas.dispatchEvent(pointerEvent("pointermove", to));
    },
    release() { fakeWindow.dispatchEvent(pointerEvent("pointerup", { x: 0, y: 0 })); },
    cancel() { fakeWindow.dispatchEvent(pointerEvent("pointercancel", { x: 0, y: 0 })); },
    drag(from: ShadowPoint, to: ShadowPoint) { this.hold(from, to); this.release(); },
    key(key: string) { canvas.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key })); },
  };
}

describe("point-light shadow projection", () => {
  it("casts a larger shadow near the light and a smaller shadow near the screen", () => {
    const light = { x: 70, y: 250 };
    const near = projectShadow(light, { x: 200, y: 250 })!;
    const far = projectShadow(light, { x: 370, y: 250 })!;
    expect(near.center).toBeCloseTo(250);
    expect(far.center).toBeCloseTo(250);
    expect(near.halfHeight).toBeGreaterThan(far.halfHeight * 2);
    expect(far.halfHeight).toBeGreaterThan(22);
  });

  it("uses tangent rays which touch the circle and intersect the screen", () => {
    const light = { x: 70, y: 230 };
    const ball = { x: 260, y: 287 };
    const shadow = projectShadow(light, ball)!;
    for (const y of [shadow.top, shadow.bottom]) {
      const slope = (y - light.y) / (496 - light.x);
      const distance = Math.abs(slope * (ball.x - light.x) - (ball.y - light.y)) / Math.hypot(slope, 1);
      expect(distance).toBeCloseTo(22, 8);
    }
  });

  it("keeps the visible tangent points on the ball, perpendicular to each light ray", () => {
    const cases = [
      { light: { x: 70, y: 250 }, ball: { x: 210, y: 250 } },
      { light: { x: 70, y: 104 }, ball: { x: 171, y: 388 } },
      { light: { x: 70, y: 386 }, ball: { x: 171, y: 104 } },
      { light: { x: 70, y: 104 }, ball: { x: 206, y: 171 } },
    ];
    for (const { light, ball } of cases) {
      const shadow = projectShadow(light, ball)!;
      for (const [tangent, screenY] of [[shadow.tangentTop, shadow.top], [shadow.tangentBottom, shadow.bottom]] as const) {
        const radius = { x: tangent.x - ball.x, y: tangent.y - ball.y };
        const ray = { x: tangent.x - light.x, y: tangent.y - light.y };
        expect(Math.hypot(radius.x, radius.y)).toBeCloseTo(22, 8);
        expect(radius.x * ray.x + radius.y * ray.y).toBeCloseTo(0, 7);
        // The illuminated edge, visible tangent and wall silhouette must be collinear.
        expect(ray.x * (screenY - light.y) - ray.y * (496 - light.x)).toBeCloseTo(0, 7);
      }
    }
  });

  it("moves the shadow opposite to the lamp and gives every round a reachable target", () => {
    const ball = { x: 260, y: 250 };
    expect(projectShadow({ x: 70, y: 210 }, ball)!.center).toBeGreaterThan(250);
    expect(projectShadow({ x: 70, y: 290 }, ball)!.center).toBeLessThan(250);
    const solutions = [{ x: 210, y: 248 }, { x: 318, y: 216 }, { x: 192, y: 269 }];
    SHADOW_ROUNDS.forEach((_, i) => expect(shadowMatches({ x: 70, y: 250 }, solutions[i], i)).toBe(true));
    expect(shadowMatches({ x: 70, y: 250 }, { x: 326, y: 305 }, 0)).toBe(false);
  });

  it("rejects invalid geometry instead of returning broken drawing coordinates", () => {
    expect(projectShadow({ x: 70, y: 250 }, { x: 80, y: 250 })).toBeNull();
    expect(projectShadow({ x: 70, y: 250 }, { x: 500, y: 250 })).toBeNull();
    expect(projectShadow({ x: 70, y: 250 }, { x: NaN, y: 250 })).toBeNull();
    expect(projectShadow({ x: 70, y: 250 }, { x: 260, y: 250 }, 0)).toBeNull();
  });
});

describe("shadow workshop interaction", () => {
  it.each(["window blur", "hidden tab", "page suspension"])("restarts the observation after %s instead of finishing in the background", interruption => {
    const session = shadowSession();
    try {
      session.drag({ x: 326, y: 305 }, { x: 210, y: 248 });
      session.advance(16);
      session.advance(500);
      expect(session.state.matched).toBe(false);
      if (interruption === "hidden tab") session.visibility(true);
      else session.windowEvent(interruption === "window blur" ? "blur" : "pagehide");
      session.advance(5000);
      expect(session.state.matched).toBe(false);
      if (interruption === "hidden tab") session.visibility(false);
      else session.windowEvent(interruption === "window blur" ? "focus" : "pageshow");
      session.advance(16);
      session.advance(500);
      expect(session.state.matched).toBe(false);
      session.advance(151);
      expect(session.state.matched).toBe(true);
    } finally { session.world.destroy(); }
  });

  it("lets a child complete all three rounds, reset and play again without an early completion", () => {
    const session = shadowSession();
    const home = { x: 326, y: 305 };
    const solutions = [{ x: 210, y: 248 }, { x: 318, y: 216 }, { x: 192, y: 269 }];
    try {
      for (let run = 0; run < 2; run++) {
        for (let round = 0; round < solutions.length; round++) {
          expect(session.state).toMatchObject({ round, matched: false, complete: false });
          session.world.next(); // Skipping an unexplored round must not advance.
          expect(session.state.round).toBe(round);
          session.hold(home, solutions[round]);
          session.advance(16); session.advance(900);
          expect(session.state.matched).toBe(false); // Observing begins after the finger lets go.
          session.release();
          session.advance(16); session.advance(651);
          expect(session.state).toMatchObject({ round, matched: true, complete: round === 2 });
          if (round < 2) session.world.next();
        }
        session.advance(1000);
        expect(session.states.filter(state => state.complete)).toHaveLength(run + 1);
        expect(session.canvas.captures.size).toBe(0);
        session.world.reset();
        expect(session.state).toMatchObject({ round: 0, matched: false, complete: false });
      }
    } finally { session.world.destroy(); }
  });

  it("recovers from a system-cancelled touch and from capture being revoked during reset", () => {
    const session = shadowSession();
    try {
      session.hold({ x: 326, y: 305 }, { x: 240, y: 280 });
      expect(session.canvas.captures.size).toBe(1);
      session.cancel();
      expect(session.canvas.captures.size).toBe(0);
      expect(session.canvas.dataset.held).toBe("");
      session.hold({ x: 240, y: 280 }, { x: 210, y: 248 });
      session.canvas.captureRevoked = true;
      expect(() => session.world.reset()).not.toThrow();
      expect(session.canvas.captures.size).toBe(0);
      expect(session.state).toMatchObject({ round: 0, matched: false });
      session.canvas.captureRevoked = false;
      session.drag({ x: 326, y: 305 }, { x: 210, y: 248 });
      session.advance(16); session.advance(651);
      expect(session.state.matched).toBe(true);
      session.world.destroy();
      const finalState = session.state;
      session.world.reset(); session.world.next();
      session.windowEvent("focus"); session.key("ArrowDown"); session.advance(1000);
      expect(session.state).toBe(finalState);
      expect(session.frames.size).toBe(0);
    } finally { session.world.destroy(); }
  });
});
