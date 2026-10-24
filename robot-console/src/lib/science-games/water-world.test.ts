import { describe, expect, it } from "vitest";
import { WATER_SCENE, createWaterWorld, submergedFraction, type WaterObjectId } from "./water-world";

describe("water sandbox physics", () => {
  it("floats dry wood and the upright clay hull while solid steel and clay sink", () => {
    const observed: WaterObjectId[] = [];
    const world = createWaterWorld(id => observed.push(id));
    for (const item of world.items) world.drop(item.id);
    const ball = world.items.find(item => item.id === "clay-ball")!;
    const boat = world.items.find(item => item.id === "clay-boat")!;
    expect(boat.body.mass).toBeCloseTo(ball.body.mass, 8);
    for (let step = 0; step < 720; step++) world.update(1000 / 60);
    for (const item of world.items) {
      if (item.id === "wood" || item.id === "clay-boat") {
        expect(item.body.bounds.min.y).toBeLessThan(WATER_SCENE.surface);
        expect(item.body.bounds.max.y).toBeGreaterThan(WATER_SCENE.surface);
      } else {
        expect(item.body.bounds.max.y).toBeCloseTo(WATER_SCENE.bottom, -1);
        expect(item.body.bounds.min.y).toBeGreaterThan(WATER_SCENE.surface);
      }
    }
    expect(new Set(observed).size).toBe(4);
    const observationCount = observed.length;
    for (let step = 0; step < 180; step++) world.update(1000 / 60);
    expect(observed).toHaveLength(observationCount);
    world.reset();
    expect(world.items.every(item => item.body.isStatic && !item.observed)).toBe(true);
    world.destroy();
  });

  it("does not count an object while a user is holding it underwater", () => {
    const observations: WaterObjectId[] = [];
    const world = createWaterWorld(id => observations.push(id));
    world.beginDrag({ x: 90, y: 139 }, "wood");
    world.moveDrag({ x: 90, y: 360 });
    for (let step = 0; step < 360; step++) world.update(1000 / 60);
    expect(observations).toEqual([]);
    world.endDrag();
    for (let step = 0; step < 720; step++) world.update(1000 / 60);
    expect(observations).toEqual(["wood"]);
    world.destroy();
  });

  it("clamps displaced volume above and below the surface", () => {
    expect(submergedFraction(100, 200, 266)).toBe(0);
    expect(submergedFraction(250, 290, 266)).toBeCloseTo(0.6);
    expect(submergedFraction(300, 340, 266)).toBe(1);
  });

  it("releases a reset drag completely and allows the next interaction", () => {
    const world = createWaterWorld(() => {});
    world.beginDrag({ x: 90, y: 139 }, "wood");
    world.moveDrag({ x: 100, y: 360 });
    for (let step = 0; step < 30; step++) world.update(1000 / 60);
    expect(world.held?.id).toBe("wood");
    expect(world.engine.world.constraints).toHaveLength(1);
    world.reset();
    expect(world.held).toBeNull();
    expect(world.pointer).toBeNull();
    expect(world.engine.world.constraints).toHaveLength(0);
    expect(world.items[0].body.position).toEqual({ x: 90, y: 139 });
    expect(world.beginDrag({ x: 215, y: 139 })).toBe("steel");
    world.endDrag();
    world.endDrag();
    expect(world.held).toBeNull();
    expect(world.engine.world.constraints).toHaveLength(0);
    world.destroy();
  });

  it("ignores invalid coordinates and late input after cleanup", () => {
    const world = createWaterWorld(() => {});
    expect(world.beginDrag({ x: NaN, y: Infinity })).toBeNull();
    world.beginDrag({ x: 90, y: 139 });
    world.moveDrag({ x: NaN, y: Infinity });
    expect(world.pointer).toEqual({ x: 90, y: 139 });
    world.destroy();
    expect(world.held).toBeNull();
    expect(world.pointer).toBeNull();
    expect(world.engine.world.constraints).toHaveLength(0);
    expect(world.beginDrag({ x: 90, y: 139 })).toBeNull();
    world.moveDrag({ x: 90, y: 350 });
    world.drop("wood"); world.reset(); world.update(1000 / 60); world.destroy();
    expect(world.engine.world.bodies).toHaveLength(0);
  });
});
