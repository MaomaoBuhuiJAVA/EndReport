type GardenSealTone = "teal" | "gold" | "coral" | "sky";

export function GardenSeal({
  glyph,
  tone = "teal",
  sequence,
  size = "medium",
}: {
  glyph: string;
  tone?: GardenSealTone;
  sequence?: number;
  size?: "mini" | "medium";
}) {
  return (
    <span
      className={`garden-seal garden-seal--${tone} garden-seal--${size}`}
      aria-hidden="true"
    >
      <span className="garden-seal__sprout">
        <i />
        <i />
      </span>
      <span className="garden-seal__glyph">{glyph}</span>
      {sequence ? <span className="garden-seal__sequence">{sequence}</span> : null}
    </span>
  );
}
