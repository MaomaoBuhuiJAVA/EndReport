import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/ScienceLab.tsx"), "utf8");

test("adds an AI menu only to experiment cards", () => {
  assert.match(component, /item\.category === "科学实验"/);
  assert.match(component, /aria-label={`打开《\$\{item\.title\}》的 AI 操作`}/);
  assert.match(component, /AI 解析这个实验/);
  assert.match(component, /生成类似主题方案/);
});

test("opens the existing pet and pre-fills a prompt instead of calling an agent API", () => {
  assert.match(component, /new CustomEvent\("kexiaobei:open"/);
  assert.match(component, /detail: \{ prompt/);
  const actionPath = component.match(
    /const prompt = action === "analyze"[\s\S]*?window\.dispatchEvent\(new CustomEvent\("kexiaobei:open"[\s\S]*?\}\)\);/,
  )?.[0] ?? "";

  assert.ok(actionPath, "AI actions should build a prompt and open the existing pet");
  assert.doesNotMatch(actionPath, /fetch\(/);
  assert.doesNotMatch(actionPath, /\/api\/agent/);
  assert.doesNotMatch(actionPath, /\bDify\b/iu);
  assert.doesNotMatch(actionPath, /https?:\/\//);
});
