import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/ScienceLab.tsx"), "utf8");

test("adds the contextual AI menu only to science-experiment cards", () => {
  assert.match(component, /item\.category === "科学实验" \? \(/);
  assert.match(component, /aria-label={`打开《\$\{item\.title\}》的 AI 操作`}/);
  assert.match(component, /AI 解析这个实验/);
  assert.match(component, /生成类似主题方案/);
  assert.doesNotMatch(component, /AI 生成 \/ 更换封面/);
});

test("opens the existing pet for an experiment action without directly calling a model", () => {
  assert.match(component, /new CustomEvent\("kexiaobei:open"/);
  assert.doesNotMatch(component, /targetResourceId: item\.id/);
  const actionPath = component.match(/const openExperimentAgent[\s\S]*?\n  \);/u)?.[0] ?? "";

  assert.ok(actionPath, "AI actions should build a prompt and open the existing pet");
  assert.doesNotMatch(actionPath, /fetch\(/);
  assert.doesNotMatch(actionPath, /\/api\/agent/);
  assert.doesNotMatch(actionPath, /\bDify\b/iu);
  assert.doesNotMatch(actionPath, /https?:\/\//);
});

test("marks the similar-theme action as a Word lesson-plan request", () => {
  const actionPath = component.match(/const openExperimentAgent[\s\S]*?\n  \);/u)?.[0] ?? "";

  assert.match(actionPath, /输出格式：Word 文档/);
  assert.match(actionPath, /lessonPlan:/);
  assert.match(actionPath, /wantsDocx: true/);
  assert.match(actionPath, /duration: "20 分钟"/);
});
