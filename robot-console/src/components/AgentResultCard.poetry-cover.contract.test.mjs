import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const card = fs.readFileSync(path.resolve("src/components/AgentResultCard.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

test("renders Qwen cover metadata and keeps every supported aspect ratio uncropped", () => {
  assert.match(card, /result\.title/);
  assert.match(card, /result\.author/);
  assert.match(card, /result\.aspect_ratio/);

  for (const [className, ratio] of [
    ["agent-result-card__cover--3-4", "3 / 4"],
    ["agent-result-card__cover--1-1", "1 / 1"],
    ["agent-result-card__cover--16-9", "16 / 9"],
  ]) {
    assert.match(styles, new RegExp(`\\.${className}\\s*\\{[^}]*aspect-ratio:\\s*${ratio.replaceAll("/", "\\/")}`));
  }

  assert.match(styles, /object-fit:\s*contain/);
});
