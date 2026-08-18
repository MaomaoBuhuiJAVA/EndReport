import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RESPONSE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const KIND_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const FEEDBACK_RATINGS = new Set(["adopted", "needs_revision", "not_helpful"]);

type FeedbackRating = "adopted" | "needs_revision" | "not_helpful";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalIdentifier(value: unknown, pattern: RegExp) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return pattern.test(candidate) ? candidate : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const responseId = typeof body.responseId === "string" ? body.responseId.trim() : "";
  if (!RESPONSE_ID_PATTERN.test(responseId)) {
    return NextResponse.json({ error: "responseId 格式无效" }, { status: 400 });
  }

  const rating = body.rating;
  if (typeof rating !== "string" || !FEEDBACK_RATINGS.has(rating)) {
    return NextResponse.json({ error: "rating 格式无效" }, { status: 400 });
  }

  const userId = optionalIdentifier(body.userId, USER_ID_PATTERN);
  if (userId === null) {
    return NextResponse.json({ error: "userId 格式无效" }, { status: 400 });
  }

  const kind = optionalIdentifier(body.kind, KIND_PATTERN);
  if (kind === null) {
    return NextResponse.json({ error: "kind 格式无效" }, { status: 400 });
  }

  const message = JSON.stringify({
    responseId,
    rating,
    ...(userId ? { userId } : {}),
    ...(kind ? { kind } : {}),
  });

  try {
    await prisma.conversation.create({
      data: {
        speaker: userId ?? "anonymous-teacher",
        message,
        reply: rating as FeedbackRating,
        scene: "agent-feedback",
      },
    });
    return NextResponse.json({ recorded: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "反馈暂时无法记录" }, { status: 500 });
  }
}
