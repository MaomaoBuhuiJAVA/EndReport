import { NextResponse } from "next/server";
import { normalizeTtsText, synthesizeQwenSpeech } from "@/lib/qwen-tts";

export const runtime = "nodejs";

const unavailableResponse = () =>
  NextResponse.json(
    { error: "语音服务暂时不可用，请稍后重试。" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

const invalidTextResponse = () =>
  NextResponse.json(
    { error: "请输入需要播报的内容。" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidTextResponse();
  }

  const rawText = body && typeof body === "object" ? (body as { text?: unknown }).text : undefined;
  const text = normalizeTtsText(rawText);
  if (!text) return invalidTextResponse();

  try {
    const voiceCall = Boolean(body && typeof body === "object" && (body as {voiceCall?: unknown}).voiceCall === true);
    const audio = await synthesizeQwenSpeech(text, {
      signal: request.signal, ...(voiceCall ? {timeoutMs: 12000} : {}),
    });
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return unavailableResponse();
  }
}
