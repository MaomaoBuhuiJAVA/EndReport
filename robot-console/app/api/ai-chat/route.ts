import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ConversationMessage } from "@/lib/types";
import { generateDifyReply, openDifyStream, parseDifyStream, uploadDifyFile, type DifyFileReference } from "@/lib/dify";
import { parseAgentResult, type AgentResult } from "@/lib/agent-result";
import {
  mergeDifyOutputFileSources,
  normalizeDifyOutputFiles,
  sanitizeDifyOutputDocumentLinks,
  type AiChatOutputFile,
} from "@/lib/ai-chat-files";
import { signAiChatOutputFiles } from "@/lib/ai-chat-download-server";
import { buildScienceLabLinks } from "@/lib/science-lab-links";
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
const VIDEO_ATTACHMENT_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"]);
const DIRECT_VIDEO_ATTACHMENT_MESSAGE = "暂不支持直接上传视频，请先提取关键帧或整理文字记录后再上传。";
const ATTACHMENT_TYPE_MISMATCH_MESSAGE = "附件类型与文件扩展名不一致，请重新选择原始文件。";

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
  return chunk.id.startsWith("science-") || chunk.document.title.startsWith("科小贝实验室：");
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

function buildLessonPlanReply(chunk: SearchChunk | null, message = "") {
  const title = chunk?.title ?? explicitLessonTopic(message) ?? namedTitle(message) ?? "幼儿科学活动";
  const content = chunk?.content ?? "";
  const sourceTitle = chunk?.document.title ?? "表单填写信息";
  const goals = sectionText(content, /(?:^|\n)\s*一[、.．]\s*活动目标\s*/u, /(?:^|\n)\s*二[、.．]\s*活动准备/u);
  const preparation = sectionText(content, /(?:^|\n)\s*二[、.．]\s*活动准备\s*/u, /(?:^|\n)\s*三[、.．]\s*(?:活动玩法|活动过程|实验步骤)/u);
  const activity = sectionText(
    content,
    /(?:^|\n)\s*三[、.．]\s*(?:活动玩法|活动过程|实验步骤)\s*/u,
    /(?:^|\n)\s*(?:(?:四|五)[、.．]\s*|实验步骤\s*[:：]?)/u,
  );
  const steps = numberedItems(activity);
  const goalText = goals || "引导幼儿在操作中观察现象、表达猜想，并分享自己的发现。";
  const preparationText = preparation || "请根据资料详情准备相应材料，并提前检查活动安全。";
  const operationSteps = steps.length
    ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : "1. 教师出示材料，邀请幼儿说一说自己的猜想。\n2. 幼儿分组操作、观察并记录。\n3. 交流发现，教师帮助梳理科学现象。";
  const classValue = requestLessonField(message, /班级(?:（[^）]*）)?\s*[:：]\s*([^；;。！？!?\n]+)/u);
  const durationValue = requestLessonField(message, /活动时长\s*[:：]\s*([^；;。！？!?\n]+)/u);
  const tableRows = [
    ["主题", title],
    ["领域", "科学"],
    ["班级", classValue],
    ["来源", sourceTitle],
    ["教学活动", title],
    ["时间", durationValue],
    ["教师", "待填写"],
    ["活动目标", goalText],
    ["重点难点", "重点：观察并表达现象；难点：把猜想与操作结果联系起来。"],
    ["活动准备", preparationText],
    ["活动内容", operationSteps],
    ["备注", "根据幼儿实际情况调整分组和指导方式。"],
    ["活动反思", "活动后填写幼儿表现、材料适切性和后续调整。"],
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
    "1. **导入与猜想**：教师围绕活动材料提出问题，鼓励幼儿先观察、猜测并说出理由。",
    `2. **操作与探究**：\n${operationSteps}`,
    "3. **观察与表达**：幼儿根据操作结果交流变化和发现，教师追问“你看到了什么”“为什么会这样”。",
    "4. **小结与延伸**：共同回顾猜想和结果的关系，可将材料投放到科学区供幼儿继续尝试。",
    "",
    "### 四、活动提示",
    "教师应根据幼儿年龄与材料特性进行分组指导，涉及剪切、小部件或液体操作时做好安全提醒。",
    "",
    "### 备课表字段",
    "| 字段 | 内容 |",
    "| --- | --- |",
    ...tableRows.map(([field, value]) => `| ${field} | ${lessonTableCell(value)} |`),
  ].join("\n");
}

function hasMeaningfulActivity(reply: string) {
  let active = false;
  let content = "";

  for (const rawLine of reply.replace(/\r/g, "").split("\n")) {
    const line = rawLine
      .trim()
      .replace(/^#{1,6}\s*/u, "")
      .replace(/^[一二三四五六七八九十\d]+\s*[、.．:：]\s*/u, "")
      .replace(/\*+/g, "")
      .trim();

    if (/^(?:活动过程|活动玩法|活动步骤|实验步骤)(?:\s*[:：]\s*(.*))?$/u.test(line)) {
      active = true;
      content += line.replace(/^(?:活动过程|活动玩法|活动步骤|实验步骤)\s*[:：]?\s*/u, "");
      continue;
    }

    if (active && /^(?:活动目标|活动准备|观察与表达|观察表达|观察与小结|小结与延伸|活动小结|小结|活动提示|延伸与安全提示|安全提示)/u.test(line)) {
      break;
    }

    if (active) content += line;
  }

  return content.replace(/[\s#*_`>\-—:：、，。！？!?()[\]{}]/gu, "").length >= 12;
}

function lessonPlanSectionLabel(rawLine: string) {
  if (/^\s*\d+\s*[.、．]\s+\*\*/u.test(rawLine)) return null;
  const line = rawLine
    .trim()
    .replace(/^#{1,6}\s*/u, "")
    .replace(/\*+/g, "")
    .replace(/^[一二三四五六七八九十\d]+\s*[、.．:：]\s*/u, "")
    .trim();
  return line.match(/^(活动目标|活动准备|活动过程|活动玩法|活动步骤|实验步骤|观察与表达|观察表达|观察与小结|小结与延伸|活动小结|小结|活动提示|延伸与安全提示|安全提示)(?:\s*[:：]|$)/u)?.[1] ?? null;
}

function sourceActivitySection(chunk: SearchChunk) {
  return buildLessonPlanReply(chunk).match(/### 三、活动过程[\s\S]*?(?=\n### 四、活动提示)/u)?.[0] ?? "";
}

function replaceIncompleteLessonPlanActivity(chunk: SearchChunk, modelReply: string) {
  if (hasMeaningfulActivity(modelReply)) return modelReply;

  const sourceActivity = sourceActivitySection(chunk);
  if (!sourceActivity) return modelReply;

  const lines = modelReply.replace(/\r/g, "").split("\n");
  let activityStart = -1;
  let activityEnd = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const label = lessonPlanSectionLabel(lines[index] ?? "");
    const isActivity = label === "活动过程" || label === "活动玩法" || label === "活动步骤" || label === "实验步骤";
    if (activityStart < 0) {
      if (isActivity) activityStart = index;
      continue;
    }
    if (label) {
      activityEnd = index;
      break;
    }
  }

  if (activityStart < 0) return `${modelReply.trim()}\n\n${sourceActivity}`.trim();

  lines.splice(activityStart, activityEnd - activityStart, ...sourceActivity.split("\n"));
  return lines.join("\n").trim();
}

function buildLessonPlanSupplement(modelReply: string) {
  const sections = lessonPlanSections(modelReply);
  const meaningfulLength = (value: string | undefined) =>
    (value ?? "").replace(/[\s#*_`>\-—:：、，。！？!?()[\]{}]/gu, "").length;

  return [
    meaningfulLength(sections.get("observation")) < 4
      ? "### 观察与小结\n观察要点：关注幼儿是否愿意先猜想、按步骤操作，并能用自己的话描述看到的变化；教师根据幼儿的记录追问“你发现了什么”。"
      : "",
    meaningfulLength(sections.get("summary")) < 4
      ? "### 活动小结\n引导幼儿把猜想、操作结果和生活经验联系起来，说明本次活动中观察到的核心现象。"
      : "",
    meaningfulLength(sections.get("tips")) < 4
      ? "### 延伸与安全提示\n将材料投放到科学区继续探索；教师活动前检查材料，幼儿操作时保持适当距离，不接触尖锐、细小或需要加热的物品。"
      : "",
  ].filter(Boolean).join("\n");
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

  for (const rawLine of reply.replace(/\r/g, "").split("\n")) {
    const cells = referenceTableCells(rawLine);
    if (cells !== null) {
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
    const label = fieldMatch ? referenceLessonField(fieldMatch[1] ?? "") : null;
    if (label) fields.set(label, fieldMatch?.[2]?.trim() ?? "");
  }

  return fields;
}

function meaningfulReferenceValue(value: string | undefined) {
  const normalized = (value ?? "")
    .replace(/[\s#*_`>\-—:：、，。！？!?()[\]{}|]/gu, "")
    .trim();
  return Boolean(normalized) && !/^(?:待填写|待补充|暂无|无)$/u.test(normalized);
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

  if (hasReferenceLessonFields(reply)) return true;

  const sections = lessonPlanSections(reply);
  const meaningfulLength = (value: string | undefined) =>
    (value ?? "").replace(/[\s#*_`>\-—:：、，。！？!?()[\]{}]/gu, "").length;

  return (
    meaningfulLength(sections.get("goals")) >= 4 &&
    meaningfulLength(sections.get("preparation")) >= 4 &&
    meaningfulLength(sections.get("activity")) >= 12 &&
    meaningfulLength(sections.get("observation")) >= 4 &&
    meaningfulLength(sections.get("summary")) >= 4 &&
    meaningfulLength(sections.get("tips")) >= 4
  );
}

function isCasualMessage(message: string) {
  const compact = message.replace(/[\s，,。！？!?、]/g, "");
  const conversationalText = compact.replace(/^(?:(?:你好|您好|嗨|哈喽|hello)(?:科小贝)?(?:呀|啊|呢)?|请问?|请|麻烦(?:你)?|能否|可以|帮我)+/i, "");
  const hasResourceIntent = /(?:科学|实验|诗|故事|教案|材料|步骤|主题|年龄|托班|小班|中班|大班|资源|资料|园所|幼儿园|学校|课程|资质|省二|评估|等级|荣誉|功能室|地址|电话|联系|招生|报名|开学|放假|照片|图片|推荐|查找|搜索|检索|找|生成|查看|有没有|如何|怎么做|怎么玩|活动|(?:介绍|推荐)(?:园所|幼儿园|课程|功能室|资质|科学|实验|故事|诗|资源|资料))/.test(compact);
  const hasExplicitConversationIntent = /(?:介绍(?:一下|下)?(?:你自己|自己)(?:好吗|吗)?|你能介绍(?:一下|下)?(?:你自己|自己)(?:好吗|吗)?|你是谁|你喜欢什么|(?:我们)?随便聊聊|我想(?:和你)?聊聊|陪我聊聊|陪我聊天|(?:讲|说)个笑话(?:吧|呀|啊|吗)?)/.test(conversationalText);
  // Keep natural small talk in conversation mode, but route substantive science
  // questions through retrieval even when the user omits words such as“实验”or“资料”.
  const hasScienceQuestionIntent =
    /(?:水|空气|气流|光影|光|影子|彩虹|植物|动物|昆虫|磁铁|磁力|重力|浮力|液体|溶解|蒸发|温度|热|电|能源|太阳|月亮|星星|天气|雨|雪|泡泡|身体|骨头|舌头|化学|密度|表面张力|虹吸|纸片|纸鱼|火山|流体)/.test(compact) &&
    /(?:为什么|为何|什么(?:是|原因)|怎么(?:会|做|回事)?|如何|怎样|吗|原理|原因|作用|能否|是否|可以吗|解释)/.test(compact);

  if (hasExplicitConversationIntent && !hasResourceIntent) {
    return true;
  }

  if (hasScienceQuestionIntent) {
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

type ChatEnrichment = {
  requestedLessonTitle: string | null;
  requestedLessonPlan: SearchChunk | null;
  unrelatedResourceTitles: string[];
  context: string;
  sources: string[];
  photos: Awaited<ReturnType<typeof searchKnowledge>>["photos"];
  uniqueSources: string[];
  labLinks: ReturnType<typeof buildScienceLabLinks>;
};

type ChatResult = {
  responseId: string;
  reply: string;
  provider: "dify" | "fallback";
  conversationId?: string;
  attachment?: AttachmentStatus;
  agentResult?: AgentResult;
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

function buildChatEnrichment(
  search: Awaited<ReturnType<typeof searchKnowledge>> | null,
  message: string,
  casualMessage: boolean,
): ChatEnrichment {
  const chunks = search?.chunks ?? [];
  const requestedLessonTitle = lessonPlanTitle(message);
  const requestedLessonPlan = requestedLessonTitle ? lessonPlanChunk(requestedLessonTitle, chunks) : null;
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
  const selectedChunks = requestedLessonTitle ? (requestedLessonPlan ? [requestedLessonPlan] : []) : chunks;
  const context = selectedChunks.map((chunk) => `《${chunk.document.title}》${chunk.content}`).join("\n");
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
    "请优先依据以上网页数据库上下文回答；只引用其中出现的资源名称、LAB 标识和媒体链接，不要补充未检索到的资源。",
  ].join("\n");
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
): ChatResult {
  const { requestedLessonPlan } = enrichment;
  let reply = modelReply;
  let usedLessonPlanFallback = false;

  if (requestedLessonPlan && modelReply && isEmptyReferenceLessonSkeleton(modelReply)) {
    reply = buildLessonPlanReply(requestedLessonPlan, message);
    usedLessonPlanFallback = true;
  } else if (requestedLessonPlan && modelReply && !hasCompleteLessonPlan(modelReply)) {
    const replyWithActivity = replaceIncompleteLessonPlanActivity(requestedLessonPlan, modelReply);
    const supplement = buildLessonPlanSupplement(replyWithActivity);
    reply = [replyWithActivity, supplement].filter(Boolean).join("\n\n");
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
    ...(files.length ? { files } : {}),
    photos: enrichment.photos,
    sources: enrichment.uniqueSources,
    labLinks: enrichment.labLinks,
  };
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
) {
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
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
          controller.close();
          return;
        }

        let answer = "";
        let conversationId: string | undefined;
        let metadata: unknown;
        const metadataSources: unknown[] = [];
        const files: unknown[] = [];
        let streamError: string | undefined;
        for await (const event of parseDifyStream(difyStream.body)) {
          if (request.signal.aborted) return;
          if (event.answer) {
            answer += event.answer;
            if (!enrichment.requestedLessonTitle) {
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
          if (event.error) {
            streamError = event.error;
            controller.enqueue(eventFrame({ type: "error", message: event.error }, encoder));
            break;
          }
        }

        if (streamError) {
          controller.close();
          return;
        }

        const outputFileSources = mergeDifyOutputFileSources(
          { answer, files, metadata: metadataSources },
          { sameOrigin: request.url, difyApiUrl },
        );
        const agentResult = enrichment.requestedLessonTitle
          ? undefined
          : parseDifyAgentResult(answer || null, message, metadata, outputFileSources, request, difyApiUrl);
        const normalizedOutputFiles = normalizeDifyOutputFiles(outputFileSources, { sameOrigin: request.url, difyApiUrl });
        const outputFiles = signAiChatOutputFiles(normalizedOutputFiles, {
          apiKey: difyApiKey,
          difyApiUrl,
          requestUrl: request.url,
        });
        const safeAnswer = sanitizeDifyOutputDocumentLinks(answer, outputFileSources, {
          sameOrigin: request.url,
          difyApiUrl,
        });
        const result = buildChatResult(
          enrichment,
          message,
          casualMessage,
          stripLessonPlanCatalogLinks(
            safeAnswer,
            enrichment.requestedLessonTitle,
            enrichment.unrelatedResourceTitles,
          ) || null,
          conversationId,
          attachment,
          agentResult,
          outputFiles,
        );
        const done = {
          type: "done" as const,
          responseId: result.responseId,
          provider: result.provider,
          reply: result.reply,
          ...(result.conversationId ? { conversationId: result.conversationId } : {}),
          ...(result.attachment ? { attachment: result.attachment } : {}),
          ...(result.agentResult ? { agentResult: result.agentResult } : {}),
          ...(result.files ? { files: result.files } : {}),
        };
        controller.enqueue(eventFrame(done, encoder));
        controller.close();
      } catch {
        if (!request.signal.aborted) {
          controller.enqueue(eventFrame({ type: "error", message: "对话服务暂时不可用" }, encoder));
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
  const searchPromise = casualMessage ? Promise.resolve(null) : searchKnowledge(message);
  const apiKey = process.env.DIFY_API_KEY;
  const apiUrl = process.env.DIFY_API_URL;
  const user = difyUserId(body.userId);
  const conversationId = difyConversationId(body.conversationId);
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
  const difyMessage = buildDifyMessage(baseDifyMessage, enrichment.context);
  const difyArgs = {
    apiKey,
    apiUrl,
    message: difyMessage,
    user,
    conversationId,
    ...(files ? { files } : {}),
  };

  if (acceptsEventStream(request)) {
    const difyStream = await openDifyStream({ ...difyArgs, signal: request.signal });
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
      );
    }
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
  );

  return NextResponse.json(result);
}
