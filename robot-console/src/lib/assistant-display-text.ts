import type { AgentResult } from "./agent-result";

type StructuredResultKind = AgentResult["kind"];

const agentResultFence = /```agent-result\s*\n[\s\S]*?\n```/giu;
const markdownImage = /!\[[^\]]*\]\([^)]*\)/gu;
const lessonPlanFieldTable = /(?:^|\n)#{1,6}\s*备课表字段\s*\n[\s\S]*$/u;

export function assistantFallbackText(kind?: StructuredResultKind) {
  switch (kind) {
    case "vision_observation":
      return "图片识别已完成，详细的可见内容、证据缺口和安全提醒见下方。";
    case "experiment_recap":
      return "实验复盘已完成，详细结果见下方。";
    case "document_diagnosis":
      return "教研材料分析已完成，详细诊断和修订建议见下方。";
    case "poetry_cover":
      return "科学诗封面已生成，详情见下方。";
    case "work_feedback":
      return "作品反馈已完成，详细建议见下方。";
    case "degraded":
    case "error":
      return "结构化结果暂不可用，请稍后重试。";
    default:
      return "";
  }
}

export function assistantDisplayText(text: string, kind?: StructuredResultKind) {
  let displayText = text
    .replace(agentResultFence, "")
    .replace(lessonPlanFieldTable, "");
  if (kind === "poetry_cover") {
    displayText = displayText.replace(markdownImage, "");
  }

  return displayText.replace(/\n{3,}/gu, "\n\n").trim() || assistantFallbackText(kind);
}
