import type { ConversationMessage } from "@/lib/types";
import type { TeachingWorkflowState } from "./state";

export type TeachingTask = "lesson" | "resources" | "document_analysis" | "document_creation" | "illustration" | "vision" | "poetry_cover" | "recap" | "feedback" | "chat" | "voice";
export type TeachingFormat = "docx" | "pdf" | "pptx" | "xlsx";
export type TeachingRoute = { task: TeachingTask; format?: TeachingFormat; pendingFormat?: "reuse" | "generate"; effectiveQuery: string; previousDraft?: string; followUp?: boolean };
export type TeachingRequest = {
  message: string;
  history?: ConversationMessage[];
  attachmentType?: "image" | "document";
  voiceCall?: boolean;
  state?: TeachingWorkflowState;
};
const urlToken = /https?:\/\/[^\s<>《》“”"'，。！？；、]+/giu;

export function requestedDocumentUrl(message: string, explicit?: string): string | undefined {
  if (explicit) return explicit.trim();
  if (!/提取|读取|解析|概括|总结|分析|整理|诊断/u.test(message) || !/正文|网页|页面|文档|文章|报告|活动记录|教案|链接/u.test(message)) return undefined;
  return message.match(urlToken)?.[0].replace(/[;!?）)]+$/u, "");
}

export function isSiteResourceQuery(query: string) {
  if ((/科学诗|科学故事|科学实验|实验.*步骤|步骤图|教案|教学设计|教学活动设计表/u.test(query)
    || /[《〈「“"][^》〉」”"]+[》〉」”"].*(?:内容|正文|全文|视频|图片|照片)/u.test(query))
    && !/功能室|阅读坊|建构空间|未来工作坊|科学廊|办园|资质|省二/u.test(query)) return false;
  return /国科二幼|国科温州|园所|办园|本园|我们园|功能室|阅读坊|绘本阅读|建构空间|未来工作坊|科学廊|大厅|全景|教师荣誉|获奖汇总|资质|省二|云宝|智慧校园|课程资料|社团/u.test(query);
}

function requestedFormat(message: string): TeachingFormat | undefined {
  message = message.replace(urlToken, "");
  if (/\b(?:docx|word)\b|Word|文档格式|导出.*文字文档/iu.test(message)) return "docx";
  if (/pdf/iu.test(message)) return "pdf";
  if (/pptx?|powerpoint|幻灯片/iu.test(message)) return "pptx";
  if (/xlsx?|excel/iu.test(message)) return "xlsx";
  return undefined;
}

function continuation(text: string) {
  return /刚才|上面|上一|这份|这个|它的|它们|继续|改成|改为|换成|换为|再导出|重新导出|还有.*(?:图|视频|资源)/u.test(text)
    || /^(?:请|帮我|给我)?(?:导出|下载|转成|转换为|保存为)\s*(?:word|docx|pdf|pptx?|excel|xlsx?)[。！!\s]*$/iu.test(text);
}

function override(base: string, next: string) {
  const topicChange = next.match(/(?:改成|改为|换成|换为)\s*([^，。！？；\n《〈「“"]{0,32}?)(?:科学诗歌|科学诗|科学故事|科学实验|诗歌|故事|实验)/u)?.[1]
    ?.replace(/托班|小班|中班|大班|上册|下册|上学期|下学期|一首|一个|一篇|一项|推荐|关于|有关|主题|的|\s/gu, "");
  if (topicChange && !/[《〈「“"][^》〉」”"]+[》〉」”"]/u.test(next)) {
    // A new science topic replaces the old one; retain the other resource filters.
    base = [base.match(/托班|小班|中班|大班/u)?.[0],
      base.match(/上册|下册|上学期|下学期/u)?.[0],
      base.match(/科学诗歌|科学诗|科学故事|科学实验|诗歌/u)?.[0],
      ...(base.match(/全部|所有|完整|步骤图|图片|照片|视频|二维码|正文|全文|内容|怎么带幼儿读|朗读建议|朗读节奏|怎么读|带读/gu) || []),
    ].filter(Boolean).join(" ");
  }
  // A new explicit title selects a new resource; keep the other constraints.
  if (/[《〈「“"][^》〉」”"]+[》〉」”"]/u.test(next)) {
    base = base.replace(/[《〈「“"][^》〉」”"]+[》〉」”"]/gu, "");
  }
  const replacements: Array<[RegExp, RegExp]> = [
    [/托班|小班|中班|大班/u, /托班|小班|中班|大班/gu],
    [/上册|下册|上学期|下学期/u, /上册|下册|上学期|下学期/gu],
    [/科学诗|科学故事|科学实验/u, /科学诗|科学故事|科学实验/gu],
    [/步骤图|图片|照片|视频|二维码|正文|全文/u, /步骤图|图片|照片|视频|二维码|正文|全文/gu],
    [/\d+\s*分钟/u, /\d+\s*分钟/gu],
    [/\b(?:word|docx|pdf|pptx?|powerpoint|excel|xlsx?)\b/iu, /\b(?:word|docx|pdf|pptx?|powerpoint|excel|xlsx?)\b/giu],
  ];
  // A title may itself contain a constraint word; preserve the named resource.
  const parts = base.split(/([《〈「“"][^》〉」”"]+[》〉」”"])/u);
  for (let index = 0; index < parts.length; index += 2) {
    for (const [present, stale] of replacements) {
      if (present.test(next)) parts[index] = parts[index].replace(stale, "");
    }
  }
  return `${parts.join("")}\n${next}`;
}

function formatOnly(message: string) {
  // Every remaining requirement (age, duration, language, content, etc.) needs generation.
  return !message.replace(/导出|下载|保存为|转换为|转换成|转成|做成|生成|刚才|上面|上一条|之前|这份|这个|这段|活动回顾|观察记录|修订稿|复盘|反馈|报告|诊断|内容|文稿|教案|文档|课件|文字|结果|成稿|文件|格式|重新|直接|然后|一份|一下|帮我|给我|麻烦|word|docx|pdf|pptx?|powerpoint|excel|xlsx?|[把将请它的再并为成\s，。！？、；：,.!?;:]/giu, "");
}

function exportRequest(message: string) {
  return /导出|下载.*(?:文稿|课件|文档)|保存为|转换格式/u.test(message);
}

function requestedTask(message: string, effectiveQuery: string, attachmentType?: TeachingRequest["attachmentType"]): TeachingTask {
  const imageRequest = message.replace(urlToken, "").match(/(?:生成|绘制|画|创作|制作|设计)[^，。；;\n]{0,48}(?:配图|插图|图片|海报|示意图|步骤图|封面)/u)?.[0];
  if (imageRequest && /封面/u.test(imageRequest)
    && /诗|诗文|诗歌/u.test(effectiveQuery)) return "poetry_cover";
  if (/作品|作业/u.test(effectiveQuery) && /反馈|评价|点评|鼓励|探究任务/u.test(message)) return "feedback";
  if (!imageRequest && /生成|设计|制作/u.test(message) && /教案|教学设计/u.test(message) && !/复盘/u.test(message)) return requestedFormat(message) ? "document_creation" : "lesson";
  if (!imageRequest && /生成|设计|制作|编写|创作/u.test(message) && /科学实验|探究活动/u.test(message) && !/找|查|检索|搜索|推荐/u.test(message)) return "lesson";
  if (/复盘|失败|改进实验|实验.*反思|反思.*实验/u.test(message)) return "recap";
  if (attachmentType === "image" && /教案|教学设计|设计.*活动|活动设计|活动方案|活动流程/u.test(message)) return "lesson";
  if (imageRequest) return "illustration";
  if (attachmentType === "image" && (requestedFormat(message) === "xlsx" || /观察表|记录表|课件/u.test(message))) return "document_creation";
  if (attachmentType === "image") return "vision";
  if (attachmentType === "document") return "document_analysis";
  if (requestedFormat(message) || /课件|活动通知|家园共育材料|教研记录|观察表|记录表/u.test(message)) return "document_creation";
  if (/教案|教学设计|设计.*活动|活动设计|活动方案|活动流程|活动目标|教学目标|教师话术/u.test(message)) return "lesson";
  if (/(?:科学诗|诗歌|童谣|诗)/u.test(message) && !/(?:写|编|创作|生成|改写)/u.test(message)) return "resources";
  if (isSiteResourceQuery(effectiveQuery) || /[《〈「“"][^》〉」”"]+[》〉」”"].*(?:内容|正文|全文|视频|图片|照片|步骤图)/u.test(message)) return "resources";
  if (/找|查|推荐|资源|科学诗|科学故事|科学实验|视频|二维码|步骤图|图片|照片|媒体|资料库|功能室|园所/u.test(message)) return "resources";
  return "chat";
}

export function routeTeachingRequest({message, history = [], attachmentType, voiceCall, state}: TeachingRequest): TeachingRoute {
  let format = requestedFormat(message);
  let previousUser="";
  for(const item of history.filter(m=>m.role==="user"))previousUser=continuation(item.content)?override(previousUser,item.content):item.content;
  previousUser = state?.query || previousUser;
  const previousAnswer = state?.draft || (!state?.pendingFormat ? history.filter(m => m.role === "assistant").at(-1)?.content : undefined);
  const followUp = !attachmentType && (continuation(message) || Boolean(format && (previousUser || previousAnswer) && formatOnly(message)));
  const effectiveQuery = followUp && previousUser ? override(previousUser,message) : message;
  // Only a format-only continuation can export existing content unchanged.
  const exportOnly = followUp && Boolean(format) && formatOnly(message);
  const previousDraft = followUp && (format || exportRequest(message)) && formatOnly(message) && state?.pendingFormat !== "generate" ? previousAnswer : undefined;
  const result = (task: TeachingTask): TeachingRoute => ({task, format, effectiveQuery,
    ...(!format && exportRequest(message) && !["voice", "resources", "illustration", "poetry_cover"].includes(task) ? {pendingFormat: formatOnly(message) ? "reuse" : "generate"} : {}),
    ...(followUp ? {followUp: true} : {}), ...(previousDraft ? {previousDraft} : {}),
  });
  if (voiceCall) return {task: "voice", effectiveQuery, ...(followUp ? {followUp: true} : {})};
  if (exportOnly) return result("document_creation");
  const task = requestedTask(message, effectiveQuery, attachmentType);
  const inheritedTask = task === "chat" && followUp ? state?.task || requestedTask(effectiveQuery, effectiveQuery) : task;
  if (inheritedTask === "illustration" || inheritedTask === "poetry_cover") format = undefined;
  if (followUp && !format && inheritedTask === "document_creation" && !exportRequest(message)) format = state?.format;
  return result(inheritedTask);
}
