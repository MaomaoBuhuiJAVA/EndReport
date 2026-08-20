import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ConversationMessage } from "@/lib/types";
import { generateDifyReply, openDifyStream, parseDifyStream, uploadDifyFile, type DifyFileReference } from "@/lib/dify";
import { parseAgentResult, type AgentFailureResult, type AgentResult } from "@/lib/agent-result";
import {
  mergeDifyOutputFileSources,
  normalizeDifyOutputFiles,
  sanitizeDifyOutputDocumentLinks,
  type AiChatOutputFile,
} from "@/lib/ai-chat-files";
import { signAiChatOutputFiles } from "@/lib/ai-chat-download-server";
import type { AiChatCoverSync } from "@/lib/ai-chat-stream";
import { buildScienceLabLinks } from "@/lib/science-lab-links";
import { synchronizeSciencePoetryCover } from "@/lib/science-cover-sync";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

// Image-generation branches can take longer than a normal text response.
// Keep the function alive long enough for Tongyi/Qwen to return its file.
export const maxDuration = 120;
export const runtime = "nodejs";

type SearchChunk = Awaited<ReturnType<typeof searchKnowledge>>["chunks"][number];

// Keep the file ceiling below Vercel's request-body limit so multipart overhead
// cannot turn an otherwise valid upload into a platform-level 413 response.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const ATTACHMENT_MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".txt", "text/plain"],
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);
const IMAGE_ATTACHMENT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"]);
const VIDEO_ATTACHMENT_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"]);
const DIRECT_VIDEO_ATTACHMENT_MESSAGE = "暂不支持直接上传视频，请先提取关键帧或整理文字记录后再上传。";
const ATTACHMENT_TYPE_MISMATCH_MESSAGE = "附件类型与文件扩展名不一致，请重新选择原始文件。";
// Dify's normal Chatflow can take much longer than a teacher should wait for
// a short text reply. Vision workflows commonly spend over 45 seconds on
// upload/analysis before their first answer, so attachments get a longer
// budget and periodic SSE progress frames keep the browser connection alive.
const FAST_DIFY_STREAM_TIMEOUT_MS = 6_000;
// A lesson-plan Chatflow usually waits for the document-generation node before
// emitting its first SSE message.  In production that first message has taken
// 48-55 seconds, so the old 45-second budget always fell through to the local
// generic template.  Keep a separate budget for lesson plans so ordinary
// requests remain responsive while generated documents are allowed to finish.
const COMPLEX_DIFY_STREAM_TIMEOUT_MS = 90_000;
const LESSON_PLAN_DIFY_STREAM_TIMEOUT_MS = 110_000;
const ATTACHMENT_DIFY_STREAM_TIMEOUT_MS = 90_000;
const SCIENCE_TOPIC_PATTERN = /(?:水|空气|气流|光影|光|影子|彩虹|植物|动物|昆虫|磁铁|磁力|磁性|磁极|吸铁|铁钉|重力|浮力|液体|溶解|蒸发|温度|热|电|能源|太阳|月亮|星星|天气|雨|雪|泡泡|身体|骨头|舌头|化学|密度|表面张力|虹吸|纸片|纸鱼|火山|流体)/u;
const SCIENCE_CATALOG_FILTER_PATTERN = /科学诗|科学故事|科学实验|科学童谣|童谣|诗歌|托班|小班|中班|大班/u;

type AttachmentStatus = {
  name: string;
  status: "uploaded" | "unavailable";
  message?: string;
};

type ChatRequestBody = {
  message?: string;
  history?: ConversationMessage[];
  userId?: string;
  conversationId?: string;
  /** Set only by a science-poem card action; never inferred from a title. */
  targetResourceId?: string;
};

type ParsedChatRequest = {
  body: ChatRequestBody;
  attachment?: File;
};

const REFERENCE_LESSON_FIELD_ALIASES: ReadonlyArray<readonly string[]> = [
  ["主题"],
  ["领域"],
  ["班级", "适用年龄段"],
  ["来源"],
  ["教学活动", "活动名称"],
  ["时间", "活动时长"],
  ["教师"],
  ["活动目标"],
  ["重点难点", "重难点"],
  ["活动准备"],
  ["活动内容", "活动过程"],
  ["备注"],
  ["活动反思", "课后反思"],
];

const REFERENCE_REQUIRED_FIELDS = [
  "主题",
  "领域",
  "班级",
  "来源",
  "教学活动",
  "时间",
  "活动目标",
  "重点难点",
  "活动准备",
  "活动内容",
] as const;

const LESSON_ANALYSIS_PATTERN = /(?:教案|活动方案|教学设计)[^。！？!?\n]{0,18}(?:分析|评估|审阅|诊断|复盘|修改|优化)|(?:分析|评估|审阅|诊断|复盘|修改|优化)[^。！？!?\n]{0,18}(?:教案|活动方案|教学设计)/u;

function isFileValue(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function parseHistory(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as ConversationMessage[] : undefined;
  } catch {
    return undefined;
  }
}

function attachmentExtension(name: string) {
  const normalized = name.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function isImageAttachment(file?: File) {
  if (!file) return false;
  return file.type.trim().toLowerCase().startsWith("image/") ||
    IMAGE_ATTACHMENT_EXTENSIONS.has(attachmentExtension(file.name));
}

function hasMeaningfulDifyAnswer(answer: string) {
  if (/```agent-result/iu.test(answer)) {
    // A structured vision response is not displayable until its closing
    // fence arrives. In particular, ` ```agent-result\n` alone must not stop
    // the timeout or be forwarded as a chat bubble.
    return /```agent-result\s*[\s\S]*?```/iu.test(answer);
  }
  const visible = answer
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .replace(/```agent-result\s*/iu, "")
    .replace(/```\s*$/u, "")
    .replace(/\s+/gu, "")
    .trim();
  return visible.length >= 2;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripResultFence(value: string) {
  return value
    .replace(/^\s*```(?:agent-result|json)?\s*/iu, "")
    .replace(/\s*```\s*$/u, "")
    .trim();
}

function isVisionPlaceholderAnswer(answer: string) {
  const candidate = stripResultFence(answer);
  if (!candidate) return true;

  const hasStructuredFence = /```agent-result/iu.test(answer);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!isRecordValue(parsed)) return false;
    const keys = Object.keys(parsed).filter((key) => parsed[key] !== undefined);
    if (keys.length === 1 && parsed.type === "boolean") return true;
    const completeVision = parsed.kind === "vision_observation" &&
      typeof parsed.image_type === "string" &&
      typeof parsed.confidence === "number" &&
      (Array.isArray(parsed.facts) || Array.isArray(parsed.visible_materials)) &&
      "privacy_risk" in parsed;
    // A complete but unrecognised/malformed agent-result object is unusable;
    // let a qvq node output repair it when available. Plain prose/JSON that
    // is not marked as an agent result remains a normal answer.
    return (hasStructuredFence || "kind" in parsed) && !completeVision;
  } catch {
    // Both an opening fence without a close and invalid JSON inside a closed
    // fence are malformed visual results.
    return hasStructuredFence;
  }
}

const VISUAL_NODE_PATTERN = /qvq|视觉|图像|图片|识别|观察|vision|image/iu;
const VISUAL_NODE_EXCLUDE_PATTERN = /建议|推荐|检索|知识|advice|recommend|retrieval|structured|结构化|格式化/iu;
const VISUAL_OUTPUT_KEYS = [
  "facts",
  "visible_materials",
  "visible_equipment",
  "observable_steps",
  "observable_phenomena",
  "judgements",
  "missing_evidence",
  "evidence_gaps",
  "safety",
  "safety_risks",
] as const;

function looksLikeVisualOutput(value: unknown) {
  if (!isRecordValue(value)) return false;
  return value.kind === "vision_observation" || VISUAL_OUTPUT_KEYS.some((key) => key in value);
}

function visualOutputText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (text.length < 2 || isVisionPlaceholderAnswer(text)) return null;
    try {
      const parsed = JSON.parse(stripResultFence(text)) as unknown;
      if (looksLikeVisualOutput(parsed)) {
        return `\`\`\`agent-result\n${JSON.stringify(parsed)}\n\`\`\``;
      }
    } catch {
      // qvq-max commonly returns ordinary Chinese prose; keep that as-is.
    }
    return text;
  }
  if (!isRecordValue(value)) return null;
  if (looksLikeVisualOutput(value)) {
    return `\`\`\`agent-result\n${JSON.stringify(value)}\n\`\`\``;
  }

  for (const key of [
    "text",
    "answer",
    "result",
    "output",
    "content",
    "observation",
    "description",
    "response",
    "structured_output",
    "structuredOutput",
  ]) {
    const nested = value[key];
    const text = visualOutputText(nested);
    if (text) return text;
  }
  return null;
}

/**
 * Chatflow node/workflow events put outputs under `data.outputs`. Dify's
 * final structured-output node can return only `{type: boolean}` even though
 * the preceding qvq-max node has a usable observation. Keep that observation
 * as a last-resort answer for image requests.
 */
function directVisionOutputFromEvent(event: { event?: string; data?: unknown }) {
  if (event.event !== "node_finished" && event.event !== "workflow_finished") return null;
  if (!isRecordValue(event.data)) return null;

  const data = event.data;
  const nodeLabel = [data.node_type, data.node_id, data.title, data.model, data.model_name]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const outputs = data.outputs;
  if (outputs === undefined) return null;

  // `workflow_finished` is the only event guaranteed to include the app's
  // published outputs. If the chat reply is a placeholder, any meaningful
  // output here is preferable to rendering an empty structured-result card.
  if (event.event === "workflow_finished") return visualOutputText(outputs);

  // Only a visual observation node is safe to return early. The later visual
  // advice node can also mention vision in its title, but it is the slow
  // step that can emit the `{\"type\":\"boolean\"}` placeholder.
  if (!VISUAL_NODE_PATTERN.test(nodeLabel) || VISUAL_NODE_EXCLUDE_PATTERN.test(nodeLabel)) return null;
  return visualOutputText(outputs);
}

function validateAttachment(file: File) {
  if (!file.name.trim()) return "附件文件名无效";
  const mimeType = file.type.trim().toLowerCase();
  const extension = attachmentExtension(file.name);
  if (mimeType.startsWith("video/") || VIDEO_ATTACHMENT_EXTENSIONS.has(extension)) {
    return DIRECT_VIDEO_ATTACHMENT_MESSAGE;
  }
  if (file.size <= 0) return "附件内容为空";
  if (file.size > MAX_ATTACHMENT_BYTES) return "附件不能超过 4MB";

  const expectedMimeType = ATTACHMENT_MIME_BY_EXTENSION.get(extension);
  if (!expectedMimeType) {
    return "暂不支持该附件格式，请上传图片、PDF、Word、PPT、Excel 或 TXT 文件";
  }
  if (mimeType && mimeType !== expectedMimeType) return ATTACHMENT_TYPE_MISMATCH_MESSAGE;
  return null;
}

async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { body: (await request.json()) as ChatRequestBody };
  }

  const formData = await request.formData();
  const attachmentValue = formData.get("attachment");
  if (attachmentValue !== null && !isFileValue(attachmentValue)) {
    throw new Error("附件字段无效");
  }
  if (attachmentValue) {
    const attachmentError = validateAttachment(attachmentValue);
    if (attachmentError) throw new Error(attachmentError);
  }

  return {
    body: {
      message: typeof formData.get("message") === "string" ? String(formData.get("message")) : undefined,
      history: parseHistory(formData.get("history")),
      userId: typeof formData.get("userId") === "string" ? String(formData.get("userId")) : undefined,
      conversationId: typeof formData.get("conversationId") === "string" ? String(formData.get("conversationId")) : undefined,
      targetResourceId: typeof formData.get("targetResourceId") === "string" ? String(formData.get("targetResourceId")) : undefined,
    },
    attachment: attachmentValue ?? undefined,
  };
}

function namedTitle(message: string) {
  return Array.from(message.matchAll(/[《〈「“\"]\s*([^》〉」”\"]+?)\s*[》〉」”\"]/g))
    .map((match) => match[1]?.trim())
    .find(Boolean);
}

function explicitLessonTopic(message: string) {
  const match = message.match(
    /主题\s*(?:是|为)?\s*[:：]?\s*(?:《\s*([^》]+?)\s*》|〈\s*([^〉]+?)\s*〉|「\s*([^」]+?)\s*」|[“"]\s*([^”"]+?)\s*[”"]|([^；;。！？!?\n]+))/u,
  );
  return [match?.[1], match?.[2], match?.[3], match?.[4], match?.[5]]
    .map((value) => value?.trim())
    .find(Boolean) ?? null;
}

function lessonPlanTitle(message: string) {
  const hasGenerationVerb = /(?:生成|编写|撰写|设计|制定|制作|输出|导出)[^。！？!?\n]{0,24}(?:教案|活动方案|教学设计)/u.test(message);
  const isAnalysisRequest = LESSON_ANALYSIS_PATTERN.test(message);
  const isLessonPlanGeneration = hasGenerationVerb || /完整(?:教案|活动方案|教学设计)/u.test(message);
  if (!isLessonPlanGeneration || isAnalysisRequest) return null;

  const explicitTopic = explicitLessonTopic(message);
  if (explicitTopic) return explicitTopic;

  const quotedTitle = namedTitle(message);
  if (quotedTitle) return quotedTitle;

  const naturalTitle = message.match(
    /(?:生成|编写|撰写|设计|制定|制作|输出|导出)\s*(?:一份|一个|一套)?\s*([^；;。！？!?\n]+?)\s*完整(?:教案|活动方案|教学设计)/u,
  )?.[1]
    ?.replace(/[《》〈〉「」“”"'`]/gu, "")
    .replace(/的\s*$/u, "")
    .trim();
  return naturalTitle && naturalTitle !== "完整" ? naturalTitle : null;
}

function isContentCreationOrAnalysisRequest(message: string) {
  const creation = /(?:生成|创作|编写|撰写|设计|制定|制作|输出|导出|策划)[^。！？!?\n]{0,32}(?:教案|活动方案|教学设计|课件|文档)/u.test(message);
  const analysis = /(?:分析|评估|审阅|诊断|复盘|修改|优化)[^。！？!?\n]{0,24}(?:教案|活动方案|教学设计|课件|文档)|(?:教案|活动方案|教学设计|课件|文档)[^。！？!?\n]{0,24}(?:分析|评估|审阅|诊断|复盘|修改|优化)/u.test(message);
  return creation || analysis;
}

function normalizeLessonTitle(value: string) {
  return value.replace(/[\s《》〈〉「」“”"'`]/gu, "").trim();
}

function lessonTitlesMatch(left: string, right: string) {
  const normalizedLeft = normalizeLessonTitle(left);
  const normalizedRight = normalizeLessonTitle(right);
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)),
  );
}

function isScienceLabChunk(chunk: SearchChunk) {
  return chunk.id?.startsWith("science-") === true || chunk.document?.title?.startsWith("科小贝实验室：") === true;
}

function lessonPlanChunk(title: string, chunks: SearchChunk[]) {
  const normalizedTitle = normalizeLessonTitle(title);
  if (!normalizedTitle) return null;

  return (
    chunks.find(
      (chunk) =>
        isScienceLabChunk(chunk) &&
        lessonTitlesMatch(chunk.title, normalizedTitle),
    ) ?? null
  );
}

function sectionText(content: string, start: RegExp, end: RegExp) {
  const normalized = content.replace(/\r/g, "").trim();
  const startMatch = normalized.match(start);
  if (!startMatch?.index && startMatch?.index !== 0) return "";

  const sectionStart = startMatch.index + startMatch[0].length;
  const remainder = normalized.slice(sectionStart);
  const endMatch = remainder.match(end);
  return remainder.slice(0, endMatch?.index).trim();
}

function numberedItems(value: string) {
  const items = value
    .split("\n")
    .map((line) => line.trim().replace(/^\d+\s*[.、．]\s*/, ""))
    .filter(Boolean);

  return items.length ? items : value.trim() ? [value.trim()] : [];
}

function requestLessonField(message: string, pattern: RegExp) {
  return message.match(pattern)?.[1]?.trim() || "待填写";
}

function lessonTableCell(value: string) {
  return value.replace(/\|/gu, "／").replace(/\s*\n\s*/gu, "；").trim() || "待填写";
}

function lessonStageDurations(value: string) {
  const requested = Number(value.match(/\d+/u)?.[0] ?? 20);
  const total = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : 20;
  const weights = [0.15, 0.4, 0.3, 0.15];
  const durations = weights.map((weight) => Math.max(1, Math.round(total * weight)));
  let difference = total - durations.reduce((sum, duration) => sum + duration, 0);
  while (difference > 0) {
    durations[1] += 1;
    difference -= 1;
  }
  while (difference < 0) {
    const index = durations.findIndex((duration) => duration > 1);
    if (index < 0) break;
    durations[index] -= 1;
    difference += 1;
  }
  return durations;
}

function fallbackLessonDetails(title: string) {
  const normalizedTitle = normalizeLessonTitle(title);
  if (/枣/u.test(normalizedTitle)) {
    return {
      goals: "引导幼儿对枣子的来源产生兴趣，知道枣子长在枣树上；通过图片排序初步了解枣树开花、结青枣、成熟变红的过程，并愿意与同伴合作表达发现。",
      preparation: "枣树开花、青枣和成熟红枣的图片或实物，去核红枣（切小块）和排序卡；每组小盘、记录纸、彩笔，活动前完成洗手并检查过敏情况。",
      operation: "1. 教师出示枣树生长图片和排序卡，示范“枣花—青枣—红枣”的排序方法。\n2. 幼儿分组观察图片或实物，合作排序并在记录纸上画出发现。\n3. 教师巡回追问“花开后会变成什么”，根据幼儿需要提供顺序提示。",
      question: "枣子是从哪里来的？它长在树上还是地里？",
      response: "教师用图片和实物回应：“枣子是枣树的果实，先开花，再结出青枣，成熟后慢慢变红。”",
    };
  }

  return {
    goals: "引导幼儿围绕主题观察、猜想和表达，在分组操作中发现现象，学习与同伴合作并用自己的语言分享结果。",
    preparation: "本次主题相关的安全实物或图片、分组操作材料、记录纸和彩笔；活动前检查材料完整性和操作安全。",
    operation: "1. 教师示范安全的操作流程，幼儿先观察并说出猜想。\n2. 幼儿分组操作、观察和记录，教师巡回提供适量提示。\n3. 各组整理材料并准备分享自己的发现。",
    question: `围绕“${title}”会发生什么，先说一说你的猜想。`,
    response: "教师先肯定不同猜想，再引导幼儿用观察和操作寻找证据，最后用简洁语言梳理发现。",
  };
}

function buildLessonPlanReply(chunk: SearchChunk | null, message = "", modelReply = "") {
  const title = chunk?.title ?? explicitLessonTopic(message) ?? namedTitle(message) ?? "幼儿科学活动";
  const fallbackDetails = fallbackLessonDetails(title);
  const content = chunk?.content ?? "";
  const sourceTitle = chunk?.document.title ?? "表单填写信息";
  const sourceGoals = sectionText(content, /(?:^|\n)\s*一[、.．]\s*活动目标\s*/u, /(?:^|\n)\s*二[、.．]\s*活动准备/u);
  const sourcePreparation = sectionText(content, /(?:^|\n)\s*二[、.．]\s*活动准备\s*/u, /(?:^|\n)\s*三[、.．]\s*(?:活动玩法|活动过程|实验步骤)/u);
  const sourceActivity = sectionText(
    content,
    /(?:^|\n)\s*三[、.．]\s*(?:活动玩法|活动过程|实验步骤)\s*/u,
    /(?:^|\n)\s*(?:(?:四|五)[、.．]\s*|实验步骤\s*[:：]?)/u,
  );
  const steps = numberedItems(sourceActivity);
  const sourceGoalText = sourceGoals || fallbackDetails.goals;
  const sourcePreparationText = sourcePreparation || fallbackDetails.preparation;
  const operationSteps = steps.length
    ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : fallbackDetails.operation;
  const modelFields = modelReply ? referenceLessonFields(modelReply) : new Map<string, string>();
  const modelSections = modelReply ? lessonPlanSections(modelReply) : new Map<string, string>();
  const usableValue = (...candidates: Array<string | undefined>) => candidates.find((value) => meaningfulReferenceValue(value))?.trim() ?? "";
  const classValue = requestLessonField(message, /班级(?:（[^）]*）)?\s*[:：]\s*([^；;。！？!?\n]+)/u);
  const durationValue = requestLessonField(message, /活动时长\s*[:：]\s*([^；;。！？!?\n]+)/u);
  const [introMinutes, operationMinutes, shareMinutes, summaryMinutes] = lessonStageDurations(durationValue);
  const goalText = usableValue(modelFields.get("活动目标"), modelSections.get("goals"), sourceGoalText) || sourceGoalText;
  const preparationText = usableValue(modelFields.get("活动准备"), modelSections.get("preparation"), sourcePreparationText) || sourcePreparationText;
  const activityCandidate = usableValue(modelFields.get("活动内容"), modelSections.get("activity"));
  const fallbackActivity = [
    "设计意图：以幼儿熟悉的生活情境引发好奇，鼓励幼儿先猜想、再操作、再表达，在完整探究过程中积累科学经验。",
    `（一）情境导入与猜想（导入猜想，约${introMinutes}分钟）`,
    `教师行为：${fallbackDetails.question}出示安全材料，请幼儿观察并说出猜想。`,
    "幼儿可能回应或表现：幼儿用自己的话表达不同想法，也可能暂时说不清楚。",
    `教师回应：${fallbackDetails.response}`,
    `建议时长：${introMinutes}分钟。`,
    `（二）分组操作与记录（分组操作，约${operationMinutes}分钟）`,
    `教师行为：示范一次安全、完整的操作流程，提醒幼儿按顺序取放材料、与同伴合作和及时记录。\n${operationSteps}`,
    "幼儿可能回应或表现：幼儿分组观察、操作和记录，可能因顺序或材料使用产生讨论。",
    "教师回应：教师巡回观察，对有困难的幼儿给予适量提示，对有新发现的幼儿追问“你是怎么做到的”“和刚才有什么不一样”。",
    `建议时长：${operationMinutes}分钟。`,
    `（三）分享表达与归纳（分享表达，约${shareMinutes}分钟）`,
    "教师行为：邀请各组展示记录或操作结果，说一说自己的发现，并将不同结果并列呈现，引导幼儿比较。",
    "幼儿可能回应或表现：幼儿用动作、词语或记录图表达发现，部分幼儿需要同伴或图片提示。",
    "教师回应：先肯定认真观察和合作，再用幼儿能理解的语言梳理共同点与差异，提示幼儿把材料归位。",
    `建议时长：${shareMinutes}分钟。`,
    `（四）总结延伸（总结延伸，约${summaryMinutes}分钟）`,
    "教师行为：带领幼儿回顾“猜想、操作、发现”的过程，把操作结果和开始的猜想联系起来，并提出生活延伸问题。",
    "幼儿可能回应或表现：幼儿说出最想继续尝试的内容，或联系家庭生活分享经验。",
    "教师回应：肯定幼儿的提问，将安全、适宜的材料投放到科学区，鼓励幼儿继续观察并把新的发现分享给同伴。",
    `建议时长：${summaryMinutes}分钟。`,
  ].join("\n");
  const activityText = hasDetailedLessonActivity(activityCandidate) ? activityCandidate : fallbackActivity;
  const keyPointsText = usableValue(
    modelFields.get("重点难点"),
    "重点：观察并表达现象；难点：把猜想与操作结果联系起来。",
  );
  const notesText = usableValue(
    modelFields.get("备注"),
    modelSections.get("tips"),
    "根据幼儿实际情况调整分组和指导方式，涉及剪切、小部件或液体操作时做好安全提醒。",
  );
  const reflectionText = usableValue(
    modelFields.get("活动反思"),
    "活动后记录幼儿表现、材料适切性和下一次调整方向。",
  );
  const tableRows = [
    ["主题", usableValue(modelFields.get("主题"), title)],
    ["领域", usableValue(modelFields.get("领域"), "科学")],
    ["班级", usableValue(modelFields.get("班级"), classValue)],
    ["来源", usableValue(modelFields.get("来源"), sourceTitle)],
    ["教学活动", usableValue(modelFields.get("教学活动"), title)],
    ["时间", usableValue(modelFields.get("时间"), durationValue)],
    ["教师", usableValue(modelFields.get("教师"), "待填写")],
    ["活动目标", goalText],
    ["重点难点", keyPointsText],
    ["活动准备", preparationText],
    ["活动内容", activityText],
    ["备注", notesText],
    ["活动反思", reflectionText],
  ];

  return [
    `## 《${title}》完整教案`,
    "",
    "### 一、活动目标",
    goalText,
    "",
    "### 二、活动准备",
    preparationText,
    "",
    "### 三、活动过程",
    activityText,
    "",
    "### 四、活动提示",
    notesText,
    "",
    "### 备课表字段",
    "| 字段 | 内容 |",
    "| --- | --- |",
    ...tableRows.map(([field, value]) => `| ${field} | ${lessonTableCell(value)} |`),
  ].join("\n");
}

function lessonPlanSections(reply: string) {
  const sections = new Map<string, string>();
  let currentSection = "";
  const normalizedReply = reply.replace(/\r/g, "");
  const sectionPattern = /^(活动目标|活动准备|活动过程|活动玩法|活动步骤|实验步骤|观察与表达|观察表达|观察与小结|小结与延伸|活动小结|小结|活动提示|延伸与安全提示|安全提示)(?:\s*[:：]\s*(.*))?$/u;

  for (const rawLine of normalizedReply.split("\n")) {
    const line = rawLine
      .trim()
      .replace(/^#{1,6}\s*/u, "")
      .replace(/\*+/g, "")
      .replace(/^[一二三四五六七八九十\d]+\s*[、.．:：]\s*/u, "")
      .trim();
    const match = /^\s*\d+\s*[.、．]\s+\*\*/u.test(rawLine) ? null : line.match(sectionPattern);

    if (match) {
      const label = match[1];
      currentSection = label === "活动过程" || label === "活动玩法" || label === "活动步骤" || label === "实验步骤"
        ? "activity"
        : label === "活动目标"
          ? "goals"
          : label === "活动准备"
            ? "preparation"
            : label === "观察与表达" || label === "观察表达" || label === "观察与小结"
              ? "observation"
              : label === "小结与延伸" || label === "活动小结" || label === "小结"
                ? "summary"
                : "tips";
      sections.set(currentSection, match[2]?.trim() ?? "");
      continue;
    }

    if (currentSection) {
      sections.set(
        currentSection,
        `${sections.get(currentSection) ?? ""}\n${rawLine}`.trim(),
      );
    }
  }

  return sections;
}

function referenceLessonField(value: string) {
  const normalized = value
    .replace(/[`*_~]/gu, "")
    .replace(/[：:]\s*$/u, "")
    .replace(/\s+/gu, "")
    .trim();
  return REFERENCE_LESSON_FIELD_ALIASES.find((aliases) => aliases.includes(normalized))?.[0] ?? null;
}

function referenceTableCells(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell)) ? [] : cells;
}

function referenceLessonFields(reply: string) {
  const fields = new Map<string, string>();
  let pendingHeaders: Array<string | null> | null = null;
  let activeLabel: string | null = null;
  let activeLines: string[] = [];

  const flushActiveField = () => {
    if (!activeLabel) return;
    const value = activeLines.join("\n").trim();
    // Keep an explicitly present but empty field (for example “教师：”) so
    // the completeness check can distinguish a real template from a missing
    // section.  Required fields still reject empty/placeholder values below.
    fields.set(activeLabel, value);
    activeLabel = null;
    activeLines = [];
  };

  const normalizedHeading = (value: string) => value
    .replace(/^\s*#{1,6}\s*/u, "")
    .replace(/^\s*[一二三四五六七八九十\d]+\s*[、.．]\s*/u, "")
    .replace(/[：:]\s*$/u, "")
    .trim();

  for (const rawLine of reply.replace(/\r/g, "").split("\n")) {
    const cells = referenceTableCells(rawLine);
    if (cells !== null) {
      flushActiveField();
      if (!cells.length) continue;
      const labels = cells.map((cell) => referenceLessonField(cell));
      if (cells.length === 2 && labels[0] && !labels[1]) {
        fields.set(labels[0], cells[1]?.trim() ?? "");
        pendingHeaders = null;
      } else if (labels.some(Boolean)) {
        pendingHeaders = labels;
      } else if (pendingHeaders) {
        pendingHeaders.forEach((label, index) => {
          if (label) fields.set(label, cells[index]?.trim() ?? "");
        });
        pendingHeaders = null;
      }
      continue;
    }

    pendingHeaders = null;
    const fieldMatch = rawLine.match(/^\s*(?:#{1,6}\s*)?(?:[-*]\s*)?([^：:|]{1,12})\s*[：:]\s*(.*)$/u);
    const inlineLabel = fieldMatch ? referenceLessonField(fieldMatch[1] ?? "") : null;
    const headingCandidate = normalizedHeading(rawLine);
    const headingLabel = !inlineLabel && headingCandidate
      ? referenceLessonField(headingCandidate)
      : null;
    const label = inlineLabel ?? headingLabel;
    if (label) {
      flushActiveField();
      activeLabel = label;
      const inlineValue = inlineLabel ? fieldMatch?.[2]?.trim() ?? "" : "";
      if (inlineValue) activeLines.push(inlineValue);
      continue;
    }

    // No new field label: retain the paragraph under the current field. This
    // is essential for the no-table DOCX style, where headings such as
    // “四、活动内容” are followed by several paragraphs and stage labels.
    if (activeLabel && rawLine.trim()) activeLines.push(rawLine.trim());
  }

  flushActiveField();

  return fields;
}

function meaningfulReferenceValue(value: string | undefined) {
  const normalized = (value ?? "")
    .replace(/[\s#*_`>\-—:：、，。！？!?()[\]{}|]/gu, "")
    .trim();
  return Boolean(normalized) && !/^(?:待填写|待补充|暂无|无)$/u.test(normalized);
}

function hasDetailedLessonActivity(value: string | undefined) {
  const normalized = (value ?? "")
    .replace(/[\s#*_`>|]/gu, "")
    .trim();
  const stages = (value ?? "").match(/(?:^|\n)\s*(?:[（(]?[一二三四五六七八九十\d]+[）)]?|\d+[.、．])/g)?.length ?? 0;
  return normalized.length >= 120 && stages >= 4;
}

function hasReferenceLessonFields(reply: string) {
  const fields = referenceLessonFields(reply);
  const hasAllLabels = REFERENCE_LESSON_FIELD_ALIASES.every((aliases) => fields.has(aliases[0]));
  if (!hasAllLabels) return false;
  return REFERENCE_REQUIRED_FIELDS.every((field) => meaningfulReferenceValue(fields.get(field)));
}

function isEmptyReferenceLessonSkeleton(reply: string) {
  const fields = referenceLessonFields(reply);
  const presentCount = REFERENCE_LESSON_FIELD_ALIASES.filter((aliases) => fields.has(aliases[0])).length;
  const meaningfulCount = REFERENCE_REQUIRED_FIELDS.filter((field) => meaningfulReferenceValue(fields.get(field))).length;
  return presentCount >= 8 && meaningfulCount === 0;
}

function hasCompleteLessonPlan(reply: string | null) {
  if (!reply) return false;

  return hasReferenceLessonFields(reply) && hasDetailedLessonActivity(referenceLessonFields(reply).get("活动内容"));
}

function isCasualMessage(message: string) {
  const compact = message.replace(/[\s，,。！？!?、]/g, "");
  const conversationalText = compact.replace(/^(?:(?:你好|您好|嗨|哈喽|hello)(?:科小贝)?(?:呀|啊|呢)?|请问?|请|麻烦(?:你)?|能否|可以|帮我)+/i, "");
  const hasResourceIntent = /(?:科学|实验|诗|故事|教案|材料|步骤|主题|年龄|托班|小班|中班|大班|资源|资料|园所|幼儿园|学校|课程|资质|省二|评估|等级|荣誉|功能室|地址|电话|联系|招生|报名|开学|放假|照片|图片|推荐|查找|搜索|检索|找|生成|查看|有没有|如何|怎么做|怎么玩|活动|(?:介绍|推荐)(?:园所|幼儿园|课程|功能室|资质|科学|实验|故事|诗|资源|资料))/.test(compact);
  const hasExplicitConversationIntent = /(?:介绍(?:一下|下)?(?:你自己|自己)(?:好吗|吗)?|你能介绍(?:一下|下)?(?:你自己|自己)(?:好吗|吗)?|你是谁|你喜欢什么|(?:我们)?随便聊聊|我想(?:和你)?聊聊|陪我聊聊|陪我聊天|(?:讲|说)个笑话(?:吧|呀|啊|吗)?)/.test(conversationalText);
  // Keep natural small talk in conversation mode, but route substantive science
  // questions through retrieval even when the user omits words such as“实验”or“资料”.
  const hasScienceTopic = SCIENCE_TOPIC_PATTERN.test(compact);
  const hasScienceQuestionIntent =
    hasScienceTopic &&
    /(?:为什么|为何|什么(?:是|原因)|怎么(?:会|做|回事)?|如何|怎样|吗|原理|原因|作用|能否|是否|可以吗|解释)/.test(compact);

  if (hasExplicitConversationIntent && !hasResourceIntent) {
    return true;
  }

  if (hasScienceQuestionIntent) {
    return false;
  }

  // Keep the existing friendly weather small talk in conversation mode. A
  // weather question (for example “为什么下雨”) is already covered above.
  if (/天气/.test(compact) && !hasResourceIntent) {
    return true;
  }

  // A teacher will often enter just a topic, such as “磁铁”. Treat it as a
  // knowledge lookup rather than casual chat so the local catalogue is always
  // available to the response pipeline.
  if (hasScienceTopic) {
    return false;
  }

  if (hasResourceIntent) {
    return false;
  }

  return true;
}

function casualFallback(message: string) {
  if (/你好|您好|嗨|在吗|早上好|下午好|晚上好/.test(message)) {
    return "你好，我是科小贝。你可以告诉我想找的年龄段和主题，或直接说“生成《玩转纸片》完整教案”。";
  }
  if (/谢谢|感谢|辛苦/.test(message)) {
    return "不客气。还可以继续问我科学故事、科学诗、实验材料或活动过程。";
  }
  if (/你会什么|能做什么|怎么用/.test(message)) {
    return "我可以帮助查找科学诗、科学故事和实验资源，按年龄段推荐内容，并根据已收录资料整理活动教案。";
  }
  if (/天气/.test(message)) {
    return "今天的天气听起来不错。我们可以一起聊聊自然现象，也可以随时开始一个科学探索。";
  }
  if (/笑话/.test(message)) {
    return "给你一个科学小笑话：为什么月亮不去上班？因为它晚上才会发光。还想聊哪个科学主题？";
  }
  if (/介绍一下你自己|介绍你自己|你喜欢什么/.test(message)) {
    return "我是科小贝，专门陪你查找园所科学资源、聊科学现象，也能根据资料整理活动教案。";
  }
  if (/聊|聊天|随便/.test(message)) {
    return "当然可以，我们可以聊科学、自然，也可以从你今天看到的一件小事开始。";
  }
  return "当然可以继续聊。你可以告诉我想探索的科学现象，或者直接问我一个问题。";
}

function fallbackReply(context: string, sources: string[], message: string, casualMessage: boolean) {
  if (!context) {
    return casualMessage
      ? casualFallback(message)
      : "我暂时没有检索到直接对应的资料。你可以补充年龄段、科学主题或具体资源名称，例如“中班水的实验”或“生成《玩转纸片》完整教案”。";
  }

  const sourceText = sources.length ? `\n\n参考资料：${Array.from(new Set(sources)).slice(0, 4).join("、")}` : "";
  const snippets = context
    .split("\n")
    .map((line) => line.replace(/#{1,6}\s*/gu, "").replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => `- ${line.slice(0, 210)}${line.length > 210 ? "..." : ""}`)
    .join("\n");

  return `我从资料库中检索到这些相关信息：\n${snippets || context.slice(0, 620)}${sourceText}`;
}

function difyUserId(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (/^[A-Za-z0-9_-]{1,80}$/.test(candidate)) return candidate;
  return `web-${crypto.randomUUID()}`;
}

function difyConversationId(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate && candidate.length <= 255 ? candidate : undefined;
}

function poetryCoverTargetId(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,160}$/u.test(candidate) ? candidate : undefined;
}

type ChatEnrichment = {
  requestedLessonTitle: string | null;
  requestedLessonPlan: SearchChunk | null;
  unrelatedResourceTitles: string[];
  context: string;
  sources: string[];
  photos: Awaited<ReturnType<typeof searchKnowledge>>["photos"];
  uniqueSources: string[];
  labLinks: ReturnType<typeof buildScienceLabLinks>;
  scienceChunks: SearchChunk[];
};

type ChatResult = {
  responseId: string;
  reply: string;
  provider: "dify" | "fallback";
  conversationId?: string;
  attachment?: AttachmentStatus;
  agentResult?: AgentResult;
  coverSync?: AiChatCoverSync;
  files?: AiChatOutputFile[];
  photos: ChatEnrichment["photos"];
  sources: string[];
  labLinks: ChatEnrichment["labLinks"];
};

function parseDifyAgentResult(
  answer: string | null | undefined,
  query: string,
  metadata: unknown,
  files: unknown,
  request: Request,
  difyApiUrl?: string,
) {
  return parseAgentResult({
    text: answer,
    query,
    metadata,
    files,
    sameOrigin: request.url,
    difyApiUrl,
  }) ?? undefined;
}

async function synchronizeGeneratedPoetryCover(
  targetResourceId: string | undefined,
  agentResult: AgentResult | undefined,
  difyApiUrl?: string,
  difyApiKey?: string,
): Promise<AiChatCoverSync | undefined> {
  if (!targetResourceId || agentResult?.kind !== "poetry_cover") return undefined;

  try {
    return (await synchronizeSciencePoetryCover(targetResourceId, agentResult.cover_url, {
      difyApiUrl,
      difyApiKey,
    })) ?? undefined;
  } catch {
    // The chat result remains useful even when a storage or database write
    // fails.  Only return a coverSync marker after the durable update succeeds.
    return undefined;
  }
}

function hasFocusedScienceCatalogQuery(message: string) {
  return SCIENCE_TOPIC_PATTERN.test(message) || SCIENCE_CATALOG_FILTER_PATTERN.test(message);
}

function buildChatEnrichment(
  search: Awaited<ReturnType<typeof searchKnowledge>> | null,
  message: string,
  casualMessage: boolean,
): ChatEnrichment {
  const chunks = search?.chunks ?? [];
  const requestedLessonTitle = lessonPlanTitle(message);
  const requestedLessonPlan = requestedLessonTitle ? lessonPlanChunk(requestedLessonTitle, chunks) : null;
  const scienceChunks = chunks.filter(isScienceLabChunk);
  const unrelatedResourceTitles = requestedLessonTitle
    ? Array.from(new Set(
      chunks
        .filter((chunk) => isScienceLabChunk(chunk))
        .filter((chunk) => !lessonTitlesMatch(chunk.title, requestedLessonTitle))
        .flatMap((chunk) => [chunk.title, chunk.document.title]),
    ))
    : [];
  // Form-generated requests use a `主题：...` field instead of book-title
  // marks. If that named resource is not available, do not attach unrelated
  // search results to the newly generated lesson plan.
  const focusedScienceQuery =
    hasFocusedScienceCatalogQuery(message) &&
    !isContentCreationOrAnalysisRequest(message);
  const selectedChunks = requestedLessonTitle
    ? (requestedLessonPlan ? [requestedLessonPlan] : [])
    : focusedScienceQuery && scienceChunks.length
      ? scienceChunks.slice(0, 2)
      : chunks.filter((chunk) => !isScienceLabChunk(chunk)).slice(0, 3);
  // Keep the evidence supplied to Dify concise. The full catalogue remains in
  // the local result/links, while a small, labelled evidence pack avoids
  // repeatedly injecting a long list into a remembered Dify conversation.
  const contextPerChunkLimit = requestedLessonTitle ? 2_200 : 900;
  const contextLimit = requestedLessonTitle ? 2_400 : 2_000;
  const context = selectedChunks
    .map((chunk) => `《${chunk.document.title}》${chunk.content.slice(0, contextPerChunkLimit)}`)
    .join("\n")
    .slice(0, contextLimit);
  const sources = selectedChunks.map((chunk) => chunk.document.title);
  const photos = !casualMessage && wantsPhotoResults(message)
    ? (requestedLessonTitle
      ? (search?.photos ?? []).filter((photo) => lessonTitlesMatch(photo.title, requestedLessonTitle))
      : search?.photos ?? [])
    : [];
  const uniqueSources = Array.from(new Set(sources)).slice(0, 5);
  const labLinks = buildScienceLabLinks(selectedChunks, message);

  return {
    requestedLessonTitle,
    requestedLessonPlan,
    unrelatedResourceTitles,
    context,
    sources,
    photos,
    uniqueSources,
    labLinks,
    scienceChunks,
  };
}

function buildDifyMessage(message: string, context: string) {
  if (!context.trim()) return message;

  return [
    message,
    "",
    "【网页数据库检索上下文】",
    context,
    "【网页数据库检索上下文结束】",
    "以上上下文是网页已经命中的园本权威资料，不是让你再次检索的请求。存在匹配条目时，必须先依据这些条目回答，不能说“没有资料”“未收录”或“上下文未出现”；若正文带有“科学原理”，应据此解释。只引用其中出现的资源名称、LAB 标识和媒体链接，不要补充未检索到的资源。",
  ].join("\n");
}

function isDirectScienceCatalogLookup(message: string, enrichment: ChatEnrichment) {
  if (!enrichment.scienceChunks.length) return false;
  if (isContentCreationOrAnalysisRequest(message)) return false;
  const compact = message.replace(/[\s，,。！？!?、；：,.!?;:()[\]{}《》〈〉「」“”‘’"']/gu, "");
  const asksForGenerationOrExplanation = /生成|创作|编写|写一|设计|教案|为什么|为何|原理|怎么|如何|解释|区别|作用/u.test(compact);
  if (asksForGenerationOrExplanation) return false;

  const hasCategory = SCIENCE_CATALOG_FILTER_PATTERN.test(compact);
  const hasLookupIntent = /找|查|搜|检索|资源|资料|内容|目录|列表|查看|看看|展示|列出|哪些|有哪|有没有|想要|给我/u.test(compact);
  const hasScienceTopic = SCIENCE_TOPIC_PATTERN.test(compact);

  return (hasCategory && (hasLookupIntent || hasScienceTopic)) ||
    // A short classroom prompt such as “磁极有什么特点” is normally a
    // request to inspect the current topic, even when it omits “查找”.
    (hasScienceTopic && (hasLookupIntent || compact.length <= 12));
}

function searchChunkField(chunk: SearchChunk, label: string) {
  return chunk.content.match(new RegExp(`^${label}：([^\\n]+)`, "mu"))?.[1]?.trim() ?? "";
}

function localScienceCatalogReply(enrichment: ChatEnrichment) {
  const matches = enrichment.scienceChunks.slice(0, 6);
  if (!matches.length) return null;

  const entries = matches.map((chunk) => {
    const age = searchChunkField(chunk, "适用年龄") || "适用年龄待确认";
    const topic = searchChunkField(chunk, "主题") || "科学主题待确认";
    const excerpt = searchChunkField(chunk, "摘要").replace(/\s+/gu, " ").slice(0, 96);
    return `- 《${chunk.title}》｜${age}｜${topic}${excerpt ? `\n  ${excerpt}` : ""}`;
  });
  return [
    `已从园本资料库中匹配到 ${enrichment.scienceChunks.length} 条相关资料${enrichment.scienceChunks.length > matches.length ? "，以下展示前 6 条" : ""}：`,
    ...entries,
  ].join("\n");
}

function localScienceCatalogResult(enrichment: ChatEnrichment, message: string): ChatResult | null {
  if (!isDirectScienceCatalogLookup(message, enrichment)) return null;
  const reply = localScienceCatalogReply(enrichment);
  if (!reply) return null;
  const matches = enrichment.scienceChunks.slice(0, 6);
  return {
    responseId: randomUUID(),
    reply,
    provider: "fallback",
    photos: enrichment.photos,
    sources: Array.from(new Set(matches.map((chunk) => chunk.document.title))).slice(0, 6),
    labLinks: buildScienceLabLinks(matches, message, 6),
  };
}

function sciencePrincipleFromChunk(chunk: SearchChunk) {
  const content = chunk.content.replace(/\r/gu, "");
  const match = content.match(/(?:^|\n)(?:科学原理|原理|科学知识|知识点)[：:]\s*([\s\S]{1,900})/u);
  if (!match?.[1]) return "";

  return match[1]
    .split(/\n(?:活动(?:目标|准备|过程)?|实验(?:材料|步骤|过程)?|操作(?:步骤|过程)?|媒体资源|安全提示|参考资料)[：:]/u)[0]
    ?.replace(/\s+/gu, " ")
    .trim()
    .slice(0, 420) ?? "";
}

function isScienceExplanationQuestion(message: string) {
  return /为什么|为何|原理|怎么(?:会|回事)?|如何|是什么|什么是|作用|区别|能否|是否|为什么会/u.test(message);
}

function localScienceExplanationResult(enrichment: ChatEnrichment, message: string): ChatResult | null {
  if (!isScienceExplanationQuestion(message)) return null;

  const matches = enrichment.scienceChunks
    .map((chunk) => ({ chunk, principle: sciencePrincipleFromChunk(chunk) }))
    .filter((candidate) => candidate.principle.length >= 16)
    .slice(0, 2);
  if (!matches.length) return null;

  const reply = [
    "根据园本资料中的科学原理：",
    ...matches.map(({ chunk, principle }) => `《${chunk.title}》：${principle}`),
  ].join("\n\n");
  const sourceChunks = matches.map(({ chunk }) => chunk);

  return {
    responseId: randomUUID(),
    reply,
    provider: "fallback",
    photos: enrichment.photos,
    sources: Array.from(new Set(sourceChunks.map((chunk) => chunk.document.title))).slice(0, 5),
    labLinks: buildScienceLabLinks(sourceChunks, message),
  };
}

function fallbackChatResult(
  enrichment: ChatEnrichment,
  message: string,
  casualMessage: boolean,
  attachment?: AttachmentStatus,
  visionRequest = false,
): ChatResult {
  const scienceMatches = enrichment.scienceChunks.slice(0, 6);
  const useScienceCatalogue =
    scienceMatches.length > 0 &&
    hasFocusedScienceCatalogQuery(message) &&
    !isContentCreationOrAnalysisRequest(message);
  const catalogReply = useScienceCatalogue ? localScienceCatalogReply(enrichment) : null;
  const timeoutResult = visionRequest ? visionTimeoutResult() : undefined;
  const lessonPlanReply = enrichment.requestedLessonTitle
    ? buildLessonPlanReply(enrichment.requestedLessonPlan, message)
    : null;
  const attachmentReply = timeoutResult
    ? ["本次图片分析暂未完成。", timeoutResult.message, timeoutResult.retry_reason].join("\n\n")
    : attachment
      ? "附件分析等待时间过长，暂未返回完整结果。请稍后重新发送，或补充文字描述。"
      : null;
  return {
    responseId: randomUUID(),
    reply: attachmentReply ?? lessonPlanReply ?? (catalogReply
      ? `我先为你整理已检索到的园本资料：\n\n${catalogReply}`
      : fallbackReply(enrichment.context, enrichment.uniqueSources, message, casualMessage)),
    provider: "fallback",
    ...(attachment ? { attachment } : {}),
    ...(timeoutResult ? { agentResult: timeoutResult } : {}),
    photos: enrichment.photos,
    sources: lessonPlanReply
      ? enrichment.uniqueSources
      : useScienceCatalogue
      ? Array.from(new Set(scienceMatches.map((chunk) => chunk.document.title))).slice(0, 6)
      : enrichment.uniqueSources,
    labLinks: lessonPlanReply
      ? enrichment.labLinks
      : useScienceCatalogue
      ? buildScienceLabLinks(scienceMatches, message, 6)
      : enrichment.labLinks,
  };
}

async function buildBlockingDifyResult(
  difyReply: Awaited<ReturnType<typeof generateDifyReply>>,
  enrichment: ChatEnrichment,
  message: string,
  request: Request,
  difyApiUrl?: string,
  difyApiKey?: string,
  attachment?: AttachmentStatus,
  targetResourceId?: string,
) {
  const outputFileSources = mergeDifyOutputFileSources(
    { answer: difyReply?.answer, files: difyReply?.files, metadata: difyReply?.metadata },
    { sameOrigin: request.url, difyApiUrl },
  );
  const agentResult = difyReply && !enrichment.requestedLessonTitle
    ? parseDifyAgentResult(difyReply.answer, message, difyReply.metadata, outputFileSources, request, difyApiUrl)
    : undefined;
  const normalizedOutputFiles = normalizeDifyOutputFiles(outputFileSources, { sameOrigin: request.url, difyApiUrl });
  const outputFiles = signAiChatOutputFiles(normalizedOutputFiles, {
    apiKey: difyApiKey,
    difyApiUrl,
    requestUrl: request.url,
  });
  const coverSync = await synchronizeGeneratedPoetryCover(
    targetResourceId,
    agentResult,
    difyApiUrl,
    difyApiKey,
  );
  const safeReply = sanitizeDifyOutputDocumentLinks(difyReply?.answer ?? "", outputFileSources, {
    sameOrigin: request.url,
    difyApiUrl,
  });

  return buildChatResult(
    enrichment,
    message,
    isCasualMessage(message),
    stripLessonPlanCatalogLinks(
      safeReply,
      enrichment.requestedLessonTitle,
      enrichment.unrelatedResourceTitles,
    ) || null,
    difyReply?.conversationId,
    attachment,
    agentResult,
    outputFiles,
    coverSync,
  );
}

function difyStreamTimeout(message: string, attachment?: AttachmentStatus) {
  if (attachment) return ATTACHMENT_DIFY_STREAM_TIMEOUT_MS;
  if (lessonPlanTitle(message)) return LESSON_PLAN_DIFY_STREAM_TIMEOUT_MS;
  return /(?:生成|创作|绘制|封面|图片|图像|导出|下载|文件|完整教案|分析(?:附件|图片))/u.test(message)
    ? COMPLEX_DIFY_STREAM_TIMEOUT_MS
    : FAST_DIFY_STREAM_TIMEOUT_MS;
}

function stripLessonPlanCatalogLinks(
  reply: string,
  requestedLessonTitle: string | null,
  unrelatedResourceTitles: string[] = [],
) {
  if (!requestedLessonTitle) return reply;

  const labReferencePattern = /(?:https?:\/\/[^\s)\]]+)?\/lab\?[^\s)\]]+/iu;
  // A model often puts an unrelated resource title and its bare `/lab` URL
  // on one line. Remove that whole catalog line so the title cannot remain
  // after the URL is sanitized.
  let cleaned = reply
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !labReferencePattern.test(line))
    .filter((line) => !/^\s*(?:配套|相关|推荐)资源(?:链接)?\s*[:：]/u.test(line))
    .join("\n")
    .replace(/\[[^\]\n]+\]\((?:https?:\/\/[^)\s]+)?\/lab\?[^)\s]*\)/giu, "")
    .replace(/(?:https?:\/\/[^\s)\]]+)?\/lab\?[^\s)\]]+/giu, "");

  for (const title of unrelatedResourceTitles) {
    const normalizedTitle = normalizeLessonTitle(title);
    if (normalizedTitle.length < 3 || normalizedTitle === normalizeLessonTitle(requestedLessonTitle)) continue;
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    cleaned = cleaned.replace(new RegExp(escapedTitle, "giu"), "");
  }

  return cleaned
    .replace(/[ \t]+$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function buildChatResult(
  enrichment: ChatEnrichment,
  message: string,
  casualMessage: boolean,
  modelReply: string | null,
  conversationId?: string,
  attachment?: AttachmentStatus,
  agentResult?: AgentResult,
  files: AiChatOutputFile[] = [],
  coverSync?: AiChatCoverSync,
): ChatResult {
  const { requestedLessonPlan } = enrichment;
  let reply = modelReply;
  let usedLessonPlanFallback = false;

  if (requestedLessonPlan && modelReply && isEmptyReferenceLessonSkeleton(modelReply)) {
    reply = buildLessonPlanReply(requestedLessonPlan, message);
    usedLessonPlanFallback = true;
  } else if (requestedLessonPlan && modelReply && !hasCompleteLessonPlan(modelReply)) {
    reply = buildLessonPlanReply(requestedLessonPlan, message, modelReply);
  } else if (enrichment.requestedLessonTitle && !modelReply) {
    reply = buildLessonPlanReply(requestedLessonPlan, message);
    usedLessonPlanFallback = true;
  }

  return {
    responseId: randomUUID(),
    reply: reply ?? fallbackReply(enrichment.context, enrichment.sources, message, casualMessage),
    provider: reply && !usedLessonPlanFallback ? "dify" : "fallback",
    conversationId,
    ...(attachment ? { attachment } : {}),
    ...(agentResult ? { agentResult } : {}),
    ...(coverSync ? { coverSync } : {}),
    ...(files.length ? { files } : {}),
    photos: enrichment.photos,
    sources: enrichment.uniqueSources,
    labLinks: enrichment.labLinks,
  };
}

function structuredResultReply(agentResult?: AgentResult) {
  switch (agentResult?.kind) {
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
      return [agentResult.message, agentResult.retry_reason].filter(Boolean).join("\n\n");
    default:
      return "";
  }
}

function visionTimeoutResult(): AgentFailureResult {
  return {
    kind: "degraded",
    code: "model_unavailable",
    message: "图片识别等待时间过长，本次未能完成分析。",
    retry: true,
    retry_reason: "请重新发送清晰的静态图片后重试；图片会自动压缩后直接交给视觉模型。",
  };
}

function answerWithoutStructuredFence(answer: string) {
  return answer.replace(/```agent-result\s*[\s\S]*?\n```/giu, "").trim();
}

function visionVisibleAnswer(answer: string, agentResult?: AgentResult) {
  const visible = answerWithoutStructuredFence(answer);
  // The classifier often prefixes the final fenced result with a short label
  // such as “视觉实验分析”. Do not expose that label as the completed answer;
  // let the structured-result card provide the stable user-facing summary.
  if (
    agentResult?.kind === "vision_observation" &&
    (!visible || /^(?:视觉实验分析|视觉分析|图片识别|图片分析)(?:[：:：\s].*)?$/iu.test(visible))
  ) {
    return structuredResultReply(agentResult);
  }
  return visible || structuredResultReply(agentResult) || "图片识别已完成。";
}

function acceptsEventStream(request: Request) {
  return request.headers
    .get("accept")
    ?.split(",")
    .some((value) => value.trim().toLowerCase() === "text/event-stream") ?? false;
}

function eventFrame(payload: unknown, encoder: TextEncoder) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamChatResponse(
  searchPromise: Promise<Awaited<ReturnType<typeof searchKnowledge>> | null>,
  difyStream: Response,
  message: string,
  casualMessage: boolean,
  request: Request,
  difyApiUrl?: string,
  difyApiKey?: string,
  attachment?: AttachmentStatus,
  firstAnswerTimeoutMs = FAST_DIFY_STREAM_TIMEOUT_MS,
  targetResourceId?: string,
  isVisionRequest = false,
) {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let streamClosed = false;
      try {
        const search = await searchPromise;
        const enrichment = buildChatEnrichment(search, message, casualMessage);
        controller.enqueue(
          eventFrame(
            {
              type: "meta",
              photos: enrichment.photos,
              sources: enrichment.uniqueSources,
              labLinks: enrichment.labLinks,
              ...(attachment ? { attachment } : {}),
            },
            encoder,
          ),
        );

        if (!difyStream.body) {
          const result = buildChatResult(enrichment, message, casualMessage, null, undefined, attachment);
          controller.enqueue(eventFrame({ type: "done", ...result }, encoder));
          streamClosed = true;
          controller.close();
          return;
        }

        let answer = "";
        let conversationId: string | undefined;
        let metadata: unknown;
        const metadataSources: unknown[] = [];
        const files: unknown[] = [];
        let directVisionAnswer: string | null = null;
        // qvq-max normally emits ordinary prose from its node before the
        // downstream DeepSeek advice node produces the structured
        // `vision_observation`. Keep that prose as a fallback, but do not
        // close the stream on it: the structured result is more useful and
        // must be allowed to arrive first.
        let visionFallbackAnswer: string | null = null;
        let streamError: string | undefined;
        let receivedAnswer = false;
        let streamTimedOut = false;
        let progressTimer: ReturnType<typeof setInterval> | null = null;
        const upstreamAbortController = new AbortController();
        let finishDirectVision: ((directAnswer: string) => void) | null = null;
        const closeController = () => {
          if (streamClosed) return;
          streamClosed = true;
          controller.close();
        };
        const abortFromRequest = () => upstreamAbortController.abort();
        request.signal.addEventListener("abort", abortFromRequest, { once: true });
        const firstAnswerTimeout = setTimeout(() => {
          if (receivedAnswer || streamClosed || request.signal.aborted) return;
          streamTimedOut = true;
          upstreamAbortController.abort();
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          if (isVisionRequest && visionFallbackAnswer && finishDirectVision) {
            finishDirectVision(visionFallbackAnswer);
            return;
          }
          const fallback = fallbackChatResult(enrichment, message, casualMessage, attachment, isVisionRequest);
          controller.enqueue(eventFrame({ type: "done", ...fallback }, encoder));
          closeController();
        }, firstAnswerTimeoutMs);

        // qvq-max emits a usable observation in a `node_finished` event before
        // the optional knowledge-retrieval and DeepSeek advice nodes complete.
        // Finish the image request here so the user sees the observation as
        // soon as the visual model is done.
        finishDirectVision = (directAnswer: string) => {
          if (streamClosed || request.signal.aborted) return;
          clearTimeout(firstAnswerTimeout);
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          receivedAnswer = true;
          const parsedResult = parseDifyAgentResult(
            directAnswer,
            message,
            undefined,
            [],
            request,
            difyApiUrl,
          );
          const safeAnswer = sanitizeDifyOutputDocumentLinks(directAnswer, [], {
            sameOrigin: request.url,
            difyApiUrl,
          });
          const visibleAnswer = visionVisibleAnswer(safeAnswer, parsedResult);
          const result = buildChatResult(
            enrichment,
            message,
            casualMessage,
            visibleAnswer,
            conversationId,
            attachment,
            parsedResult ?? undefined,
          );
          controller.enqueue(eventFrame({
            type: "done",
            responseId: result.responseId,
            provider: result.provider,
            reply: result.reply,
            ...(result.conversationId ? { conversationId: result.conversationId } : {}),
            ...(result.attachment ? { attachment: result.attachment } : {}),
            ...(result.agentResult ? { agentResult: result.agentResult } : {}),
          }, encoder));
          upstreamAbortController.abort();
          closeController();
        };

        if (attachment) {
          const progress = isVisionRequest
            ? "图片正在识别，模型分析可能需要几十秒，请保持页面打开。"
            : "文档正在解析，模型分析可能需要几十秒，请保持页面打开。";
          controller.enqueue(eventFrame({ type: "status", message: progress }, encoder));
          progressTimer = setInterval(() => {
            if (!streamClosed && !streamTimedOut && !request.signal.aborted && !receivedAnswer) {
              controller.enqueue(eventFrame({ type: "status", message: progress }, encoder));
            }
          }, 8_000);
        }

        try {
          for await (const event of parseDifyStream(difyStream.body, upstreamAbortController.signal)) {
            if (request.signal.aborted || streamTimedOut) return;
            if (event.answer) {
              answer += event.answer;
              // Vision workflows stream the opening `agent-result` fence before
              // the JSON body. Treating that marker as a completed answer makes
              // the client render an empty bubble and disables the real timeout.
              const meaningfulAnswer = hasMeaningfulDifyAnswer(answer);
              // The classifier node also emits a short `answer` event (often
              // just “视觉实验分析”). It is not the image result and must not
              // stop the attachment timeout. Only a complete vision result can
              // do that; qvq node output is handled below and only a complete
              // structured observation may return directly.
              const completeVisionAnswer = isVisionRequest &&
                parseDifyAgentResult(answer, message, metadata, [], request, difyApiUrl)?.kind === "vision_observation";
              if (((!isVisionRequest && meaningfulAnswer) || completeVisionAnswer) && !receivedAnswer) {
                receivedAnswer = true;
                clearTimeout(firstAnswerTimeout);
              }
              if (!enrichment.requestedLessonTitle && !isVisionRequest) {
                controller.enqueue(eventFrame({ type: "delta", delta: event.answer }, encoder));
              }
            }
            if (event.conversationId) conversationId = event.conversationId;
            if (event.metadata !== undefined) {
              metadata = event.metadata;
              metadataSources.push(event.metadata);
            }
            if (event.files !== undefined) {
              files.push(...(Array.isArray(event.files) ? event.files : [event.files]));
            }
            if (isVisionRequest && event.data !== undefined) {
              const visualOutput = directVisionOutputFromEvent(event);
              if (visualOutput && !directVisionAnswer) {
                // A qvq node's plain-text observation is useful evidence, but
                // it is not the final contract consumed by the UI. Only an
                // actually parseable, complete vision result may finish the
                // stream early; otherwise continue to the downstream advice
                // and structured-output nodes.
                const parsedVisualOutput = parseDifyAgentResult(
                  visualOutput,
                  message,
                  undefined,
                  [],
                  request,
                  difyApiUrl,
                );
                if (parsedVisualOutput?.kind === "vision_observation") {
                  directVisionAnswer = visualOutput;
                  finishDirectVision?.(visualOutput);
                  return;
                }
                if (!visionFallbackAnswer) visionFallbackAnswer = visualOutput;
              }
            }
            if (event.error) {
              streamError = event.error;
              // A qvq observation collected before a downstream failure is a
              // usable, evidence-bounded answer. Let the normal fallback
              // completion below deliver it instead of terminating on an
              // error-only frame.
              if (!isVisionRequest || !visionFallbackAnswer) {
                controller.enqueue(eventFrame({ type: "error", message: event.error }, encoder));
              }
              break;
            }
          }
        } finally {
          clearTimeout(firstAnswerTimeout);
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          request.signal.removeEventListener("abort", abortFromRequest);
        }

        if (streamTimedOut || streamClosed) return;
        if (streamError) {
          if (isVisionRequest && visionFallbackAnswer && finishDirectVision) {
            finishDirectVision(visionFallbackAnswer);
            return;
          }
          closeController();
          return;
        }

        const outputFileSources = mergeDifyOutputFileSources(
          { answer, files, metadata: metadataSources },
          { sameOrigin: request.url, difyApiUrl },
        );
        const normalizedOutputFiles = normalizeDifyOutputFiles(outputFileSources, { sameOrigin: request.url, difyApiUrl });
        const outputFiles = signAiChatOutputFiles(normalizedOutputFiles, {
          apiKey: difyApiKey,
          difyApiUrl,
          requestUrl: request.url,
        });
        // Prefer a completed downstream vision result. If the downstream
        // result is only a placeholder (or ordinary classifier prose), use
        // the qvq observation captured above instead of exposing an empty or
        // misleading answer. Ordinary text-chat responses are unchanged.
        const parsedStreamAnswer = isVisionRequest
          ? parseDifyAgentResult(answer || null, message, metadata, outputFileSources, request, difyApiUrl)
          : undefined;
        const visionFallback = directVisionAnswer ?? visionFallbackAnswer;
        const answerForVision = isVisionRequest && visionFallback &&
          parsedStreamAnswer?.kind !== "vision_observation"
          ? visionFallback
          : answer;
        const parsedResult = enrichment.requestedLessonTitle
          ? undefined
          : parseDifyAgentResult(answerForVision || null, message, metadata, outputFileSources, request, difyApiUrl);
        const coverSync = await synchronizeGeneratedPoetryCover(
          targetResourceId,
          parsedResult,
          difyApiUrl,
          difyApiKey,
        );
        const safeAnswer = sanitizeDifyOutputDocumentLinks(answerForVision, outputFileSources, {
          sameOrigin: request.url,
          difyApiUrl,
        });
        const visibleAnswer = stripLessonPlanCatalogLinks(
          isVisionRequest ? visionVisibleAnswer(safeAnswer, parsedResult) : answerWithoutStructuredFence(safeAnswer),
          enrichment.requestedLessonTitle,
          enrichment.unrelatedResourceTitles,
        ) || structuredResultReply(parsedResult) || null;
        const result = buildChatResult(
          enrichment,
          message,
          casualMessage,
          visibleAnswer,
          conversationId,
          attachment,
          parsedResult,
          outputFiles,
          coverSync,
        );
        const done = {
          type: "done" as const,
          responseId: result.responseId,
          provider: result.provider,
          reply: result.reply,
          ...(result.conversationId ? { conversationId: result.conversationId } : {}),
          ...(result.attachment ? { attachment: result.attachment } : {}),
          ...(result.agentResult ? { agentResult: result.agentResult } : {}),
          ...(result.coverSync ? { coverSync: result.coverSync } : {}),
          ...(result.files ? { files: result.files } : {}),
        };
        controller.enqueue(eventFrame(done, encoder));
        closeController();
      } catch {
        if (!request.signal.aborted && !streamClosed) {
          controller.enqueue(eventFrame({ type: "error", message: "对话服务暂时不可用" }, encoder));
          streamClosed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  let parsedRequest: ParsedChatRequest;
  try {
    parsedRequest = await parseChatRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求格式无效";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { body, attachment } = parsedRequest;

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const casualMessage = isCasualMessage(message);
  const hasImageAttachment = isImageAttachment(attachment);
  // An uploaded image/document already provides the evidence for the model.
  // Avoid an unrelated catalogue search before opening Dify's stream; that
  // extra wait is especially noticeable on the mobile chat surface.
  const searchPromise = casualMessage || attachment ? Promise.resolve(null) : searchKnowledge(message);
  const apiKey = process.env.DIFY_API_KEY;
  const apiUrl = process.env.DIFY_API_URL;
  const user = difyUserId(body.userId);
  // Do not carry a previous text conversation into visual analysis. A stale
  // conversation can send the Dify classifier back through the regular chat
  // branch before it reaches qvq-max.
  // A generated lesson is a standalone artifact.  Reusing the chat's previous
  // conversation can send Dify back through an earlier classifier branch and
  // make the result depend on unrelated messages in the floating assistant.
  const conversationId = hasImageAttachment || lessonPlanTitle(message)
    ? undefined
    : difyConversationId(body.conversationId);
  const targetResourceId = poetryCoverTargetId(body.targetResourceId);
  let attachmentStatus: AttachmentStatus | undefined;
  let files: DifyFileReference[] | undefined;

  if (attachment) {
    const uploadedFile = await uploadDifyFile({
      apiKey,
      apiUrl,
      file: attachment,
      fileName: attachment.name,
      user,
      signal: request.signal,
    });
    if (uploadedFile) {
      files = [uploadedFile];
      attachmentStatus = { name: attachment.name, status: "uploaded" };
    } else {
      attachmentStatus = {
        name: attachment.name,
        status: "unavailable",
        message: "附件暂未上传，已继续文字对话；请稍后重试或补充文字描述。",
      };
    }
  }

  const baseDifyMessage = attachment && !files?.length
    ? `${message}\n\n[系统提示：用户附件未能上传，请不要假设可以看到附件内容；明确说明证据不足，并请求用户补充文字描述。]`
    : message;
  const search = await searchPromise;
  const enrichment = buildChatEnrichment(search, message, casualMessage);
  const localCatalogResult = attachment ? null : localScienceCatalogResult(enrichment, message);
  if (localCatalogResult) {
    return NextResponse.json(localCatalogResult);
  }
  const localExplanationResult = attachment ? null : localScienceExplanationResult(enrichment, message);
  if (localExplanationResult) {
    return NextResponse.json(localExplanationResult);
  }
  const documentRouteInstruction = attachment && files?.length && !hasImageAttachment
    ? [
      `[系统路由指令：检测到文档附件“${attachment.name}”，请直接进入“上传文档解析”分支。先使用教学文件解析器读取附件正文，再按用户问题完成分析、改写或导出；不要把文档当作图片，也不要进入视觉实验分析或实验复盘分支。]`,
      "如果用户要求分析教案，请返回 document_diagnosis 结构化结果；如果用户要求导出文件，继续交给对应的文档交付节点。",
      baseDifyMessage,
    ].join("\n\n")
    : baseDifyMessage;
  const difyMessage = buildDifyMessage(
    hasImageAttachment && files?.length
      ? [
        "[系统路由指令：检测到图片附件，请直接进入“视觉实验分析”分支。将用户输入和图片交给 qvq-max 读取；不要进入普通文本聊天、不要等待用户补充文字、不要生成文件。请尽快返回简洁的可见事实、证据不足和安全提醒。]",
        baseDifyMessage,
      ].join("\n\n")
      : documentRouteInstruction,
    enrichment.context,
  );
  const difyArgs = {
    apiKey,
    apiUrl,
    message: difyMessage,
    user,
    conversationId,
    ...(files ? { files } : {}),
  };

  if (acceptsEventStream(request)) {
    const streamTimeoutMs = difyStreamTimeout(message, attachmentStatus);
    const streamStartedAt = Date.now();
    const difyStream = await openDifyStream({
      ...difyArgs,
      signal: request.signal,
      timeoutMs: streamTimeoutMs,
    });
    if (difyStream) {
      return streamChatResponse(
        Promise.resolve(search),
        difyStream,
        message,
        casualMessage,
        request,
        apiUrl,
        apiKey,
        attachmentStatus,
        Math.max(250, streamTimeoutMs - (Date.now() - streamStartedAt)),
        targetResourceId,
        hasImageAttachment && Boolean(files?.length),
      );
    }
    // Do not make a second blocking Dify request after the streaming provider
    // has already missed the fast-response deadline. It doubles the wait and
    // can leave the teacher staring at a spinner with no usable answer.
    return NextResponse.json(
      fallbackChatResult(enrichment, message, casualMessage, attachmentStatus, hasImageAttachment && Boolean(files?.length)),
    );
  }

  const difyReply = await generateDifyReply(difyArgs);
  const outputFileSources = mergeDifyOutputFileSources(
    { answer: difyReply?.answer, files: difyReply?.files, metadata: difyReply?.metadata },
    { sameOrigin: request.url, difyApiUrl: apiUrl },
  );
  const agentResult = difyReply && !enrichment.requestedLessonTitle
    ? parseDifyAgentResult(difyReply.answer, message, difyReply.metadata, outputFileSources, request, apiUrl)
    : undefined;
  const normalizedOutputFiles = normalizeDifyOutputFiles(outputFileSources, { sameOrigin: request.url, difyApiUrl: apiUrl });
  const outputFiles = signAiChatOutputFiles(normalizedOutputFiles, {
    apiKey,
    difyApiUrl: apiUrl,
    requestUrl: request.url,
  });
  const coverSync = await synchronizeGeneratedPoetryCover(
    targetResourceId,
    agentResult,
    apiUrl,
    apiKey,
  );
  const safeReply = sanitizeDifyOutputDocumentLinks(difyReply?.answer ?? "", outputFileSources, {
    sameOrigin: request.url,
    difyApiUrl: apiUrl,
  });
  const result = buildChatResult(
    enrichment,
    message,
    casualMessage,
    stripLessonPlanCatalogLinks(
      safeReply,
      enrichment.requestedLessonTitle,
      enrichment.unrelatedResourceTitles,
    ) || null,
    difyReply?.conversationId,
    attachmentStatus,
    agentResult,
    outputFiles,
    coverSync,
  );

  return NextResponse.json(result);
}
