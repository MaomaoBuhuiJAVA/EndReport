import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/SciencePet.tsx"), "utf8");

test("keeps an ai response id through each assistant reply path", () => {
  assert.match(component, /type PetMessage = \{[\s\S]*?responseId\?: string;/);
  assert.match(component, /type AssistantReply = \{[\s\S]*?responseId\?: string;/);
  assert.match(component, /responseId: data\.responseId,/);
  assert.match(component, /responseId: event\.responseId \?\? message\.responseId,/);
  assert.ok((component.match(/responseId: reply\.responseId,/g) ?? []).length >= 2);
});

test("offers and records three teacher feedback states only for persisted assistant replies", () => {
  assert.match(component, /function submitAssistantFeedback\(/);
  assert.match(component, /fetch\("\/api\/ai-feedback"/);
  assert.match(component, /message\.role === "assistant" \? \(/);
  assert.match(component, /\{message\.responseId \? \(/);
  for (const label of ["已采用", "需修改", "无帮助"]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /已记录/);
});
