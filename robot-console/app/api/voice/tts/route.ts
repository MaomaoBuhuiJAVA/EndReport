import { NextResponse } from "next/server";
import { normalizeTtsText, synthesizeXfyunSpeech } from "@/lib/xfyun-tts";

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
    const audio = await synthesizeXfyunSpeech(text, { signal: request.signal });
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return unavailableResponse();
  }
}
