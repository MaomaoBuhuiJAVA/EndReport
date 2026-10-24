import { describe, expect, it } from "vitest";
import { resolvePetMotionState, type PetMotionContext } from "./pet-motion";

const idle: PetMotionContext = {
  dragging: false, autoWalk: null, open: false, busy: false,
  receivingReply: false, speaking: false, listening: false,
};

describe("mascot motion follows the current interaction", () => {
  it("rests when closed and listens when the conversation opens", () => {
    expect(resolvePetMotionState(idle)).toBe("idle");
    expect(resolvePetMotionState({ ...idle, open: true })).toBe("waiting");
  });

  it("changes from thinking to answering as soon as reply text streams", () => {
    expect(resolvePetMotionState({ ...idle, busy: true })).toBe("working");
    expect(resolvePetMotionState({ ...idle, busy: true, receivingReply: true })).toBe("speaking");
    expect(resolvePetMotionState({ ...idle, receivingReply: true })).toBe("idle");
  });

  it("shows speech during voice playback even while the request is busy", () => {
    expect(resolvePetMotionState({ ...idle, busy: true, speaking: true })).toBe("speaking");
    expect(resolvePetMotionState({ ...idle, listening: true })).toBe("waiting");
  });

  it("prioritizes active dragging over response and patrol motion", () => {
    expect(resolvePetMotionState({ ...idle, dragging: true, busy: true, speaking: true, autoWalk: "left" })).toBe("moving");
    expect(resolvePetMotionState({ ...idle, autoWalk: "right" })).toBe("running-right");
    expect(resolvePetMotionState({ ...idle, autoWalk: "left" })).toBe("running-left");
  });
});
