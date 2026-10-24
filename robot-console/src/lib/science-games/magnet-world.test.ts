import { describe, expect, it } from "vitest";
import { Bodies, Body, Composite, Engine, Events } from "matter-js";
import { magneticForce } from "./magnet-world";

describe("magnet sandbox physics", () => {
  it("lifts different masses against gravity when the magnet is equally close above them", () => {
    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    const light = Bodies.circle(100, 300, 10, { frictionAir: 0.025 });
    const heavy = Bodies.circle(300, 300, 10, { frictionAir: 0.025 });
    Body.setMass(light, 1);
    Body.setMass(heavy, 10);
    Composite.add(engine.world, [light, heavy]);
    Events.on(engine, "beforeUpdate", () => {
      for (const body of [light, heavy]) {
        Body.applyForce(body, body.position, magneticForce({ x: body.position.x, y: 230 }, body.position, body.mass));
      }
    });
    for (let step = 0; step < 24; step++) Engine.update(engine, 1000 / 60);

    expect(light.position.y).toBeLessThan(280);
    expect(heavy.position.y).toBeLessThan(280);
    expect(light.velocity.y).toBeLessThan(0);
    expect(heavy.velocity.y).toBeLessThan(0);
    expect(heavy.position.y).toBeCloseTo(light.position.y, 7);
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  });

  it("leaves an out-of-range object falling just like an unforced control", () => {
    const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
    const distant = Bodies.circle(100, 300, 10, { frictionAir: 0.025 });
    const control = Bodies.circle(300, 300, 10, { frictionAir: 0.025 });
    Composite.add(engine.world, [distant, control]);
    Events.on(engine, "beforeUpdate", () => {
      Body.applyForce(distant, distant.position, magneticForce({ x: 100, y: 150 }, distant.position, distant.mass));
    });
    for (let step = 0; step < 30; step++) Engine.update(engine, 1000 / 60);

    expect(distant.position.y).toBeGreaterThan(350);
    expect(distant.position.y).toBeCloseTo(control.position.y, 8);
    expect(distant.velocity.y).toBeCloseTo(control.velocity.y, 8);
    expect(distant.position.x).toBeCloseTo(100, 8);
    Composite.clear(engine.world, false);
    Engine.clear(engine);
  });
});
