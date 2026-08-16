import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/SciencePet.tsx"), "utf8");
const home = fs.readFileSync(path.resolve("src/components/AgentHome.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

test("uses the same 科小贝 chat from the focused home page", () => {
  assert.match(home, /import \{ SciencePet \} from "@\/components\/SciencePet"/);
  assert.match(home, /new Event\("kexiaobei:open"\)/);
  assert.match(home, /<SciencePet\s*\/>/);
});

test("keeps the conversation scrollable instead of dropping earlier messages", () => {
  assert.doesNotMatch(component, /messages\.slice\(-8\)/);
  assert.match(component, /window\.addEventListener\("kexiaobei:open"/);
  assert.match(component, /<Link className="pet-message__lab-link" href=\{link\.href\}/);
});

test("registers the home-page open event before the first interactive paint", () => {
  assert.match(component, /useLayoutEffect\(\(\) => \{[\s\S]*?window\.addEventListener\("kexiaobei:open"/);
  assert.match(component, /__kexiaobeiOpenRequested/);
  assert.match(home, /__kexiaobeiOpenRequested = true/);
});

test("gives the 科小贝 chat a full usable mobile viewport instead of a half-height panel", () => {
  assert.match(styles, /\.pet-chat\s*\{[\s\S]*?position:\s*fixed[\s\S]*?max-height:\s*min\(640px, calc\(100dvh - 154px\)\)/);
  assert.match(styles, /\.pet-chat__messages\s*\{[\s\S]*?flex:\s*1[\s\S]*?max-height:\s*none/);
  assert.match(styles, /@media \(max-width: 720px\)\s*\{[\s\S]*?\.pet-chat\s*\{[\s\S]*?bottom:\s*calc\(72px \+ env\(safe-area-inset-bottom\)\)[\s\S]*?height:\s*min\(680px, calc\(100dvh - 84px\)\)/);
  assert.match(styles, /@media \(max-width: 720px\)\s*\{[\s\S]*?\.pet-chat\s*\{[\s\S]*?width:\s*min\(360px, calc\(100dvw - 24px\)\)/);
});

test("keeps generated lesson plans readable inside the chat bubble", () => {
  assert.match(component, /className="pet-message__markdown"/);
  assert.match(styles, /\.pet-message__markdown\s+h1,[\s\S]*?font-size:\s*12px/);
  assert.match(styles, /\.pet-message__markdown\s+ul,[\s\S]*?padding-left:\s*18px/);
});
