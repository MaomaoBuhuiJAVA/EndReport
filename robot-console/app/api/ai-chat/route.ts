import { NextResponse } from "next/server";
import type { ConversationMessage } from "@/lib/types";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { buildScienceLabLinks } from "@/lib/science-lab-links";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

const systemPrompt = `你是“龙湾区国科温州第二幼儿园”的园所信息问答助手。
回答规则：
1. 优先依据园所资料库与科小贝资源库中的科学诗、科学故事、科学实验内容回答。
2. 如果资料库没有明确内容，不要编造，请说明“资料库暂未收录明确内容”。
3. 回答要适合家长、访客和教师阅读，简洁、温和、可信。
4. 当用户问功能室、空间、环境、有没有照片、图片、参观等内容时，提醒用户可以查看下方相关照片。
5. 不向普通用户提供云宝设备状态、实时监控、日志或控制细节。`;

type SearchChunk = Awaited<ReturnType<typeof searchKnowledge>>["chunks"][number];

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

function hasCompleteLessonPlan(reply: string | null) {
  if (!reply) return false;

  const requiredSections = [
    /活动目标/,
    /活动准备/,
    /活动过程|活动步骤/,
    /观察与表达|观察表达|观察与小结/,
    /小结与延伸|活动小结|小结/,
    /活动提示|延伸与安全提示|安全提示/,
  ];

  return requiredSections.every((section) => section.test(reply));
}

function isCasualMessage(message: string) {
  const compact = message.replace(/[\s，,。！？!?、]/g, "");

  if (/(?:科学|实验|诗|故事|教案|材料|步骤|主题|年龄|托班|小班|中班|大班|资源|资料|园所|照片|图片|推荐|查找|搜索|检索|找|生成|查看|介绍|有没有|如何|怎么做|怎么玩|活动)/.test(compact)) {
    return false;
  }

  return /^(?:(?:你好|您好|嗨|哈喽|hello)(?:科小贝)?(?:呀|啊|呢|喽|哟)?|(?:科小贝)?(?:在吗|早上好|下午好|晚上好|晚安|再见|拜拜)(?:呀|啊|呢|啦)?|(?:谢谢|感谢|辛苦)(?:科小贝)?(?:啦|了|呀)?|(?:科小贝)?(?:你是谁|你叫什么|你会什么|你能做什么|能做什么|怎么用|陪我聊聊|陪我聊天|聊聊|聊天|讲个笑话|说个笑话|讲笑话|今天的?天气(?:真|挺)?好|天气(?:真|挺)?好|你吃饭了吗|吃饭了吗|无聊|哈哈+)(?:呀|啊|呢|啦)?)$/i.test(compact);
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
  return "我暂时没有检索到直接对应的资料。你可以补充年龄段、科学主题或具体资源名称，例如“中班水的实验”或“生成《玩转纸片》完整教案”。";
}

function fallbackReply(context: string, sources: string[], message: string) {
  if (!context) {
    return casualFallback(message);
  }

  const sourceText = sources.length ? `\n\n参考资料：${Array.from(new Set(sources)).slice(0, 4).join("、")}` : "";
  const snippets = context
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => `- ${line.slice(0, 210)}${line.length > 210 ? "..." : ""}`)
    .join("\n");

  return `我从资料库中检索到这些相关信息：\n${snippets || context.slice(0, 620)}${sourceText}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    history?: ConversationMessage[];
  };

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const casualMessage = isCasualMessage(message);
  const search = casualMessage ? null : await searchKnowledge(message);
  const chunks = search?.chunks ?? [];
  const requestedLessonPlan = lessonPlanChunk(message, chunks);
  const selectedChunks = requestedLessonPlan ? [requestedLessonPlan] : chunks;
  const context = selectedChunks.map((chunk) => `《${chunk.document.title}》${chunk.content}`).join("\n");
  const sources = selectedChunks.map((chunk) => chunk.document.title);
  const photos = !casualMessage && wantsPhotoResults(message) ? search?.photos ?? [] : [];
  const uniqueSources = Array.from(new Set(sources)).slice(0, 5);
  const labLinks = buildScienceLabLinks(selectedChunks, message);

  const modelReply = await generateDeepSeekReply({
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiUrl: process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions",
    systemPrompt: requestedLessonPlan
      ? `${systemPrompt}\n6. 当用户要求“完整教案”时，必须按“活动目标、活动准备、活动过程、观察与小结、延伸与安全提示”完整输出；活动过程不可省略。`
      : systemPrompt,
    context,
    history: body.history ?? [],
    message,
    maxTokens: requestedLessonPlan ? 1600 : undefined,
  });
  const reply = requestedLessonPlan && !hasCompleteLessonPlan(modelReply)
    ? buildLessonPlanReply(requestedLessonPlan)
    : modelReply;

  return NextResponse.json({
    reply: reply ?? fallbackReply(context, sources, message),
    provider: reply ? "deepseek" : "fallback",
    photos,
    sources: uniqueSources,
    labLinks,
  });
}
