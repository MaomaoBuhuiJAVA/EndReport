export type PetAnimationState =
  | "idle" | "waiting" | "working" | "speaking" | "moving"
  | "running-left" | "running-right";

export type PetMotionContext = {
  dragging: boolean;
  autoWalk: "left" | "right" | null;
  open: boolean;
  busy: boolean;
  receivingReply: boolean;
  speaking: boolean;
  listening: boolean;
};

export function resolvePetMotionState(context: PetMotionContext): PetAnimationState {
  if (context.dragging) return "moving";
  if (context.speaking || (context.busy && context.receivingReply)) return "speaking";
  if (context.busy) return "working";
  if (context.listening || context.open) return "waiting";
  if (context.autoWalk) return `running-${context.autoWalk}`;
  return "idle";
}
