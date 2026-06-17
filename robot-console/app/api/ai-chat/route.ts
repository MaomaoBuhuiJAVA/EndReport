import { NextResponse } from "next/server";
import type { ConversationMessage } from "@/lib/types";

const systemPrompt = `你是幼儿园陪伴机器人“星芽”的校园问答助手。
回答要温柔、简短、安全，适合教师在校园场景中使用。
如果问题涉及医疗、危险动作、隐私或无法确认的校园信息，请提醒教师核实并交由成人处理。`;

function fallbackReply(message: string) {
  if (message.includes("课程") || message.includes("安排")) {
    return "今天可以安排晨间问候、绘本阅读和英文单词卡互动。我会把回答控制在幼儿能听懂的长度。";
  }

  if (message.includes("安全") || message.includes("摔倒")) {
    return "我会先提醒孩子停下并呼叫老师，同时记录异常事件。涉及身体不适时，需要老师立即确认。";
  }

  return "收到。我会用温柔、清楚的语气回答，并把内容控制在适合幼儿园场景的范围内。";
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    message?: string;
    history?: ConversationMessage[];
  };

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl =
    process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/chat/completions";

  if (!apiKey) {
    return NextResponse.json({
      reply: fallbackReply(body.message),
      provider: "mock",
    });
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...(body.history ?? []).slice(-8),
          { role: "user", content: body.message },
        ],
        temperature: 0.6,
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = data.choices?.[0]?.message?.content?.trim();

    return NextResponse.json({
      reply: reply || fallbackReply(body.message),
      provider: "deepseek",
    });
  } catch {
    return NextResponse.json({
      reply: fallbackReply(body.message),
      provider: "fallback",
    });
  }
}
