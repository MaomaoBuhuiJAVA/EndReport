import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const card = fs.readFileSync(path.resolve("src/components/AgentResultCard.tsx"), "utf8");

test("renders a compact Chinese card for document diagnosis results", () => {
  assert.match(card, /case ["']document_diagnosis["']/);
  for (const field of [
    "age_fit",
    "science_accuracy",
    "material_safety",
    "inquiry_opportunities",
    "teacher_questions",
    "evidence_gaps",
    "data_gaps",
    "research_questions",
    "reflection_basis",
    "revision_text",
    "revised_outline",
    "delivery_markdown",
  ]) {
    assert.match(card, new RegExp(`result\\.${field}`));
  }
  for (const label of ["教研材料诊断", "问题清单", "数据缺口", "下一步研究问题", "可替换修订文本", "修订后框架", "导出稿"]) {
    assert.match(card, new RegExp(label));
  }
});
