import { NextResponse } from "next/server";
import type { ConversationMessage } from "@/lib/types";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

const systemPrompt = `你是“龙湾区国科温州第二幼儿园”的园所信息问答助手。
回答规则：
1. 优先依据园所资料库与科小贝实验室中的科学诗、教师实验、家庭实验内容回答。
2. 如果资料库没有明确内容，不要编造，请说明“资料库暂未收录明确内容”。
3. 回答要适合家长、访客和教师阅读，简洁、温和、可信。
4. 当用户问功能室、空间、环境、有没有照片、图片、参观等内容时，提醒用户可以查看下方相关照片。
5. 不向普通用户提供云宝设备状态、实时监控、日志或控制细节。`;

function fallbackReply(context: string, sources: string[]) {
  if (!context) {
    return "资料库暂未检索到明确内容。你可以问我科学诗、亲子实验、教师教案、园所概览、功能室、荣誉资质或云宝简介。";
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

  const search = await searchKnowledge(message);
  const context = search.chunks.map((chunk) => `《${chunk.document.title}》${chunk.content}`).join("\n");
  const sources = search.chunks.map((chunk) => chunk.document.title);
  const photos = wantsPhotoResults(message) ? search.photos : [];
  const uniqueSources = Array.from(new Set(sources)).slice(0, 5);

  if (search.chunks.length >= 2 || photos.length >= 3) {
    return NextResponse.json({
      reply: `${fallbackReply(context, sources)}${photos.length ? "\n\n页面下方已为你匹配相关照片，可以直接点开查看。" : ""}`,
      provider: "database",
      photos,
      sources: uniqueSources,
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";

  if (!apiKey) {
    return NextResponse.json({
      reply: fallbackReply(context, sources),
      provider: "fallback",
      photos,
      sources: uniqueSources,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "system",
            content: context ? `资料库检索内容如下：\n${context.slice(0, 8000)}` : "资料库检索内容：未找到直接相关资料。",
          },
          ...(body.history ?? []).slice(-6),
          { role: "user", content: message },
        ],
        temperature: 0.2,
        max_tokens: 900,
      }),
    });

    if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content?.trim();
    clearTimeout(timeout);

    return NextResponse.json({
      reply: reply || fallbackReply(context, sources),
      provider: "deepseek",
      photos,
      sources: uniqueSources,
    });
  } catch {
    clearTimeout(timeout);
    return NextResponse.json({
      reply: fallbackReply(context, sources),
      provider: "fallback",
      photos,
      sources: uniqueSources,
    });
  }
}
