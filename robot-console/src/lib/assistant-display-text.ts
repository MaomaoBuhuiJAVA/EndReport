import type { AgentResult } from "./agent-result";

type StructuredResultKind = AgentResult["kind"];

const agentResultFence = /```agent-result\s*\n[\s\S]*?\n```/giu;
const markdownImage = /!\[[^\]]*\]\([^)]*\)/gu;

export function assistantDisplayText(text: string, kind?: StructuredResultKind) {
  if (!kind) return text;

  let displayText = text.replace(agentResultFence, "");
  if (kind === "poetry_cover") {
    displayText = displayText.replace(markdownImage, "");
  }

  return displayText.replace(/\n{3,}/gu, "\n\n").trim();
}
