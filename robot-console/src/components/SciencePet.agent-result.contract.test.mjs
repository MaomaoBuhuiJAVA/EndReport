import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/SciencePet.tsx"), "utf8");
const cardPath = path.resolve("src/components/AgentResultCard.tsx");
const card = fs.existsSync(cardPath) ? fs.readFileSync(cardPath, "utf8") : "";
const displayText = fs.readFileSync(path.resolve("src/lib/assistant-display-text.ts"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

test("renders a compact Chinese card for every structured result kind", () => {
  for (const kind of ["poetry_cover", "vision_observation", "experiment_recap", "work_feedback", "degraded"]) {
    assert.match(card, new RegExp(`case [\"']${kind}[\"']`));
  }
  for (const label of ["科学诗封面", "图片观察", "实验复盘", "作品反馈", "结构化结果暂不可用"]) {
    assert.match(card, new RegExp(label));
  }
  assert.match(card, /role="status"/);
  assert.match(card, /cover_url/);
  assert.match(card, /image_type/);
  assert.match(card, /goal_analysis/);
  assert.match(card, /recommended_resources/);
});

test("keeps structured results attached to assistant messages and stream updates", () => {
  assert.match(component, /import\s+\{\s*AgentResultCard\s*\}\s+from\s+[\"']@\/components\/AgentResultCard[\"']/);
  assert.match(component, /import\s+type\s+\{\s*AgentResult\s*\}\s+from\s+[\"']@\/lib\/agent-result[\"']/);
  assert.match(component, /agentResult\?:\s*AgentResult/);
  assert.match(component, /agentResult:\s*data\.agentResult/);
  assert.match(component, /agentResult:\s*event\.agentResult/);
  assert.match(component, /<AgentResultCard\s+result=\{message\.agentResult\}/);
});

test("does not render the same Tongyi cover image twice", () => {
  assert.match(component, /import\s+\{\s*assistantDisplayText\s*\}\s+from\s+["']@\/lib\/assistant-display-text["']/);
  assert.match(component, /assistantDisplayText\(message\.text, message\.agentResult\?\.kind\)/);
  assert.match(displayText, /kind\s*===\s*["']poetry_cover["']/);
  assert.match(displayText, /displayText\.replace\(markdownImage,\s*["']{2}\)/);
});

test("keeps result cards visually subordinate to the existing chat bubble", () => {
  assert.match(styles, /\.agent-result-card\s*\{/);
  assert.match(styles, /\.agent-result-card__list\s*\{/);
  assert.match(styles, /\.agent-result-card__cover\s*\{/);
  assert.match(styles, /\.agent-result-card__warning\s*\{/);
});

test("does not build lab links directly from an untrusted Dify resource id", () => {
  assert.match(card, /scienceLabHrefForId/);
  assert.doesNotMatch(card, /href=\{`\/lab\?item=\$\{encodeURIComponent\(resource\.resource_id\)\}`\}/);
});
