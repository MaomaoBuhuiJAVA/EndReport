import { Bodies, Body, Composite, Constraint, Engine, Events, Query, Vector, type Vector as MatterVector } from "matter-js";

export const WATER_SCENE = { width: 560, height: 510, surface: 266, bottom: 468, left: 30, right: 530 };
export const WATER_OBJECTS = [
  { id: "wood", name: "松木块", result: "浮起来了", detail: "这块干燥松木的平均密度比水小。", home: { x: 90, y: 139 } },
  { id: "steel", name: "实心钢球", result: "沉下去了", detail: "实心钢球的密度比水大，会沉到水底。", home: { x: 215, y: 139 } },
  { id: "clay-ball", name: "橡皮泥球", result: "沉下去了", detail: "这团实心橡皮泥的密度比水大。", home: { x: 340, y: 139 } },
  { id: "clay-boat", name: "橡皮泥船", result: "浮起来了", detail: "同样多的橡皮泥捏成船，船口朝上时能排开更多水。", home: { x: 465, y: 139 } },
] as const;
export type WaterObjectId = (typeof WATER_OBJECTS)[number]["id"];
export type WaterItem = { id: WaterObjectId; body: Body; home: MatterVector; wetTime: number; observed: boolean; held: boolean; displacement: number };
export type WaterWorld = ReturnType<typeof createWaterWorld>;

/** A 2D displaced-area approximation. The boat remains upright with its opening above water. */
export function submergedFraction(top: number, bottom: number, surface: number) {
  if (bottom <= surface) return 0;
  return Math.max(0, Math.min(1, (bottom - surface) / Math.max(1, bottom - top)));
}

export function createWaterWorld(onObservation: (id: WaterObjectId) => void) {
  const engine = Engine.create({ enableSleeping: false, positionIterations: 8, velocityIterations: 8 });
  engine.gravity.y = 1;
  const wood = Bodies.rectangle(90, 139, 78, 58, { density: 0.00055, chamfer: { radius: 8 }, frictionAir: 0.015, restitution: 0.08 });
  const steel = Bodies.circle(215, 139, 28, { density: 0.0078, frictionAir: 0.01, restitution: 0.12 });
  const clayBall = Bodies.circle(340, 139, 29, { density: 0.0022, frictionAir: 0.015, restitution: 0.03 });
  const clayBoat = Bodies.trapezoid(465, 139, 110, 55, 0.3, { density: 0.001, frictionAir: 0.02, restitution: 0.03 });
  // Preserve clay mass; a hollow hull has a larger external displaced volume.
  Body.setMass(clayBoat, clayBall.mass);
  Body.setInertia(clayBoat, Infinity);
  const bodies = [wood, steel, clayBall, clayBoat];
  const items: WaterItem[] = WATER_OBJECTS.map((object, index) => {
    const body = bodies[index];
    body.label = object.id;
    const displacement = object.id === "clay-boat" ? 110 * 55 : body.area;
    Body.setStatic(body, true);
    return { id: object.id, body, home: { ...object.home }, wetTime: 0, observed: false, held: false, displacement };
  });
  const walls = [
    Bodies.rectangle(280, WATER_SCENE.bottom + 18, 560, 36, { isStatic: true, friction: 0.5 }),
    Bodies.rectangle(WATER_SCENE.left - 17, 270, 34, 470, { isStatic: true }),
    Bodies.rectangle(WATER_SCENE.right + 17, 270, 34, 470, { isStatic: true }),
    Bodies.rectangle(280, -50, 560, 70, { isStatic: true }),
  ];
  Composite.add(engine.world, [...bodies, ...walls]);
  let heldItem: WaterItem | null = null;
  let grab: Constraint | null = null;
  let pointer: MatterVector | null = null;
  let destroyed = false;

  const beforeUpdate = () => {
    const step = Math.min(32, engine.timing.lastDelta || 1000 / 60);
    for (const item of items) {
      const body = item.body;
      if (body.isStatic) continue;
      const fraction = submergedFraction(body.bounds.min.y, body.bounds.max.y, WATER_SCENE.surface);
      if (fraction > 0) {
        const force = item.displacement * 0.001 * fraction * engine.gravity.y * engine.gravity.scale;
        Body.applyForce(body, body.position, { x: 0, y: -force });
        // Water drag damps oscillation while allowing a released object to settle naturally.
        const damping = 1 - 0.055 * fraction;
        Body.setVelocity(body, { x: body.velocity.x * damping, y: body.velocity.y * damping });
        Body.setAngularVelocity(body, body.angularVelocity * (1 - fraction * 0.08));
      }
      if (!item.held && fraction > 0.2 && body.speed < 2.3) {
        item.wetTime += step;
        if (item.wetTime >= 1250 && !item.observed) {
          item.observed = true;
          onObservation(item.id);
        }
      } else if (!item.observed) item.wetTime = 0;
    }
  };
  Events.on(engine, "beforeUpdate", beforeUpdate);

  function endDrag() {
    if (grab) Composite.remove(engine.world, grab);
    if (heldItem) heldItem.held = false;
    heldItem = null; grab = null; pointer = null;
  }

  function beginDrag(point: MatterVector, id?: WaterObjectId) {
    if (destroyed || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    endDrag();
    const exact = Query.point(bodies, point);
    const item = id ? items.find(entry => entry.id === id) : [...items].reverse().find(entry => exact.includes(entry.body))
      ?? [...items].sort((a, b) => Vector.magnitude(Vector.sub(a.body.position, point)) - Vector.magnitude(Vector.sub(b.body.position, point))).find(entry => {
        const bounds = entry.body.bounds;
        return point.x > bounds.min.x - 20 && point.x < bounds.max.x + 20 && point.y > bounds.min.y - 20 && point.y < bounds.max.y + 20;
      });
    if (!item) return null;
    Body.setStatic(item.body, false);
    if (item.id === "clay-boat") Body.setInertia(item.body, Infinity);
    item.held = true;
    item.wetTime = 0;
    heldItem = item;
    pointer = { ...point };
    grab = Constraint.create({ pointA: { ...point }, bodyB: item.body, pointB: { x: 0, y: 0 }, length: 0, stiffness: 0.3, damping: 0.16 });
    Composite.add(engine.world, grab);
    return item.id;
  }

  return {
    engine, items,
    get held() { return heldItem; },
    get pointer() { return pointer; },
    beginDrag,
    moveDrag(point: MatterVector) {
      if (destroyed || !grab || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const safe = { x: Math.max(60, Math.min(500, point.x)), y: Math.max(55, Math.min(450, point.y)) };
      grab.pointA = safe;
      pointer = safe;
    },
    endDrag,
    drop(id: WaterObjectId) {
      if (destroyed) return;
      endDrag();
      const item = items.find(entry => entry.id === id)!;
      Body.setStatic(item.body, false);
      if (id === "clay-boat") Body.setInertia(item.body, Infinity);
      Body.setAngle(item.body, 0);
      Body.setVelocity(item.body, { x: 0, y: 0 });
      Body.setPosition(item.body, { x: item.home.x, y: WATER_SCENE.surface - 70 });
      item.wetTime = 0;
    },
    reset() {
      if (destroyed) return;
      endDrag();
      for (const item of items) {
        Body.setPosition(item.body, item.home);
        Body.setAngle(item.body, 0);
        Body.setVelocity(item.body, { x: 0, y: 0 });
        Body.setAngularVelocity(item.body, 0);
        Body.setStatic(item.body, true);
        item.wetTime = 0;
        item.observed = false;
        item.held = false;
      }
    },
    update(delta: number) {
      if (!destroyed) Engine.update(engine, Math.min(delta, 1000 / 60));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      endDrag();
      Events.off(engine, "beforeUpdate", beforeUpdate);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}
