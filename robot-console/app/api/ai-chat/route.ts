import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ConversationMessage } from "@/lib/types";
import { generateDifyReply, openDifyStream, parseDifyStream, uploadDifyFile, type DifyFileReference } from "@/lib/dify";
import { parseAgentResult, type AgentResult } from "@/lib/agent-result";
import { buildScienceLabLinks } from "@/lib/science-lab-links";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

// Image-generation branches can take longer than a normal text response.
// Keep the function alive long enough for Tongyi/Qwen to return its file.
export const maxDuration = 120;

type SearchChunk = Awaited<ReturnType<typeof searchKnowledge>>["chunks"][number];

// Keep the file ceiling below Vercel's request-body limit so multipart overhead
// cannot turn an otherwise valid upload into a platform-level 413 response.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/heic",
  "image/heif",
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".heic",
  ".heif",
  ".txt",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
]);

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
  if (file.size <= 0) return "附件内容为空";
  if (file.size > MAX_ATTACHMENT_BYTES) return "附件不能超过 4MB";
  const mimeType = file.type.trim().toLowerCase();
  const extension = attachmentExtension(file.name);
  if (!SUPPORTED_ATTACHMENT_MIME_TYPES.has(mimeType) && !SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension)) {
    return "暂不支持该附件格式，请上传图片、PDF、Word、PPT、Excel 或 TXT 文件";
  }
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

function lessonPlanChunk(message: string, chunks: SearchChunk[]) {
  const title = namedTitle(message);
  if (!title || !/教案|活动方案|教学设计/.test(message)) return null;

  return (
    chunks.find(
      (chunk) =>
        chunk.id.startsWith("science-") &&
        chunk.title.includes(title) &&
        /科小贝实验室：/.test(chunk.document.title),
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

function buildLessonPlanReply(chunk: SearchChunk) {
  const goals = sectionText(chunk.content, /(?:^|\n)\s*一[、.．]\s*活动目标\s*/u, /(?:^|\n)\s*二[、.．]\s*活动准备/u);
  const preparation = sectionText(chunk.content, /(?:^|\n)\s*二[、.．]\s*活动准备\s*/u, /(?:^|\n)\s*三[、.．]\s*(?:活动玩法|活动过程|实验步骤)/u);
  const activity = sectionText(
    chunk.content,
    /(?:^|\n)\s*三[、.．]\s*(?:活动玩法|活动过程|实验步骤)\s*/u,
    /(?:^|\n)\s*(?:(?:四|五)[、.．]\s*|实验步骤\s*[:：]?)/u,
  );
  const steps = numberedItems(activity);
  const goalText = goals || "引导幼儿在操作中观察现象、表达猜想，并分享自己的发现。";
  const preparationText = preparation || "请根据资料详情准备相应材料，并提前检查活动安全。";
  const operationSteps = steps.length
    ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : "1. 教师出示材料，邀请幼儿说一说自己的猜想。\n2. 幼儿分组操作、观察并记录。\n3. 交流发现，教师帮助梳理科学现象。";

  return [
    `## 《${chunk.title}》完整教案`,
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

function buildLessonPlanSupplement(chunk: SearchChunk, modelReply: string) {
  const hasActivity = hasMeaningfulActivity(modelReply);
  const sourceReply = buildLessonPlanReply(chunk);
  const sourceActivity = sourceReply.match(/### 三、活动过程[\s\S]*?(?=\n### 四、活动提示)/u)?.[0] ?? "";

  return [
    !hasActivity && sourceActivity
      ? `${sourceActivity}\n\n> 以上为依据现有资料整理的建议组织过程。`
      : "",
    "### 观察与小结",
    "观察要点：关注幼儿是否愿意先猜想、按步骤操作，并能用自己的话描述看到的变化；教师根据幼儿的记录追问“你发现了什么”。",
    "",
    "### 活动小结",
    "引导幼儿把猜想、操作结果和生活经验联系起来，说明本次活动中观察到的核心现象。",
    "",
    "### 延伸与安全提示",
    "将材料投放到科学区继续探索；教师活动前检查材料，幼儿操作时保持适当距离，不接触尖锐、细小或需要加热的物品。",
  ].filter(Boolean).join("\n");
}

function hasCompleteLessonPlan(reply: string | null) {
  if (!reply) return false;

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
    const match = line.match(sectionPattern);

    if (match) {
      const label = match[1];
      currentSection = label === "活动玩法" || label === "活动步骤" || label === "实验步骤"
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
  requestedLessonPlan: SearchChunk | null;
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
  const requestedLessonPlan = lessonPlanChunk(message, chunks);
  const selectedChunks = requestedLessonPlan ? [requestedLessonPlan] : chunks;
  const context = selectedChunks.map((chunk) => `《${chunk.document.title}》${chunk.content}`).join("\n");
  const sources = selectedChunks.map((chunk) => chunk.document.title);
  const photos = !casualMessage && wantsPhotoResults(message) ? search?.photos ?? [] : [];
  const uniqueSources = Array.from(new Set(sources)).slice(0, 5);
  const labLinks = buildScienceLabLinks(selectedChunks, message);

  return {
    requestedLessonPlan,
    context,
    sources,
    photos,
    uniqueSources,
    labLinks,
  };
}

function buildChatResult(
  enrichment: ChatEnrichment,
  message: string,
  casualMessage: boolean,
  modelReply: string | null,
  conversationId?: string,
  attachment?: AttachmentStatus,
  agentResult?: AgentResult,
): ChatResult {
  const { requestedLessonPlan } = enrichment;
  const incompleteLessonPlan = requestedLessonPlan && modelReply && !hasCompleteLessonPlan(modelReply);
  const usedLessonPlanFallback = Boolean(requestedLessonPlan && !modelReply);
  const reply = incompleteLessonPlan
    ? `${modelReply.trim()}\n\n${buildLessonPlanSupplement(requestedLessonPlan, modelReply)}`
    : usedLessonPlanFallback
      ? buildLessonPlanReply(requestedLessonPlan!)
      : modelReply;

  return {
    responseId: randomUUID(),
    reply: reply ?? fallbackReply(enrichment.context, enrichment.sources, message, casualMessage),
    provider: reply && !usedLessonPlanFallback ? "dify" : "fallback",
    conversationId,
    ...(attachment ? { attachment } : {}),
    ...(agentResult ? { agentResult } : {}),
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
        let files: unknown;
        for await (const event of parseDifyStream(difyStream.body)) {
          if (request.signal.aborted) return;
          if (event.answer) {
            answer += event.answer;
            controller.enqueue(eventFrame({ type: "delta", delta: event.answer }, encoder));
          }
          if (event.conversationId) conversationId = event.conversationId;
          if (event.metadata !== undefined) metadata = event.metadata;
          if (event.files !== undefined) files = event.files;
          if (event.error) {
            controller.enqueue(eventFrame({ type: "error", message: event.error }, encoder));
          }
        }

        const agentResult = parseDifyAgentResult(answer || null, message, metadata, files, request, difyApiUrl);
        const result = buildChatResult(
          enrichment,
          message,
          casualMessage,
          answer || null,
          conversationId,
          attachment,
          agentResult,
        );
        const done = {
          type: "done" as const,
          responseId: result.responseId,
          provider: result.provider,
          reply: result.reply,
          ...(result.conversationId ? { conversationId: result.conversationId } : {}),
          ...(result.attachment ? { attachment: result.attachment } : {}),
          ...(result.agentResult ? { agentResult: result.agentResult } : {}),
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

  const difyMessage = attachment && !files?.length
    ? `${message}\n\n[系统提示：用户附件未能上传，请不要假设可以看到附件内容；明确说明证据不足，并请求用户补充文字描述。]`
    : message;
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
        searchPromise,
        difyStream,
        message,
        casualMessage,
        request,
        apiUrl,
        attachmentStatus,
      );
    }
  }

  const difyReplyPromise = generateDifyReply(difyArgs);
  const [search, difyReply] = await Promise.all([searchPromise, difyReplyPromise]);
  const agentResult = difyReply
    ? parseDifyAgentResult(difyReply.answer, message, difyReply.metadata, difyReply.files, request, apiUrl)
    : undefined;
  const result = buildChatResult(
    buildChatEnrichment(search, message, casualMessage),
    message,
    casualMessage,
    difyReply?.answer ?? null,
    difyReply?.conversationId,
    attachmentStatus,
    agentResult,
  );

  return NextResponse.json(result);
}
