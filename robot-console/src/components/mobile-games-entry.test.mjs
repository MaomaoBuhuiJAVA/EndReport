import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const home = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");

test("keeps 科学乐园 available as a mobile friendly header icon", () => {
  assert.match(home, /import \{[\s\S]*?\bGamepad2\b[\s\S]*?\} from "lucide-react"/);
  assert.match(home, /aria-label="进入科学乐园"/);
  assert.match(home, /href="\/games"/);
  assert.match(home, /<Gamepad2 aria-hidden="true" size=\{18\} \/>/);
  assert.match(home, /<span className="hidden sm:inline">科学乐园<\/span>/);
  assert.doesNotMatch(home, /const homeMobileNavItems/);
});
