import type { AgentResult } from "./agent-result";

type StructuredResultKind = AgentResult["kind"];

const agentResultFence = /```agent-result\s*\n[\s\S]*?\n```/giu;
const markdownImage = /!\[[^\]]*\]\([^)]*\)/gu;
const lessonPlanFieldTable = /(?:^|\n)#{1,6}\s*备课表字段\s*\n[\s\S]*$/u;

export function assistantDisplayText(text: string, kind?: StructuredResultKind) {
  let displayText = text
    .replace(agentResultFence, "")
    .replace(lessonPlanFieldTable, "");
  if (kind === "poetry_cover") {
    displayText = displayText.replace(markdownImage, "");
  }

  return displayText.replace(/\n{3,}/gu, "\n\n").trim();
}
