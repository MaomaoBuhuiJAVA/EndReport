import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const card = fs.readFileSync(path.resolve("src/components/AgentResultCard.tsx"), "utf8");

test("renders all full visual observation evidence sections", () => {
  for (const field of [
    "visible_materials",
    "visible_equipment",
    "observable_steps",
    "observable_phenomena",
    "possible_science_concepts",
    "safety_risks",
    "evidence_gaps",
  ]) {
    assert.match(card, new RegExp(`result\\.${field}`));
  }
  for (const label of ["可见材料", "可见器材", "可观察步骤", "实验现象或作品特征", "可能的科学概念", "安全风险", "证据不足"]) {
    assert.match(card, new RegExp(label));
  }
  assert.match(card, /contains_face_or_child/);
  assert.match(card, /contains_name_or_identifier/);
  assert.match(card, /recommended_visibility/);
});
