import { NextResponse } from "next/server";
import { persistSciencePoetryCoverUrl } from "@/lib/science-cover-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Completes the public poem-upload flow after the asynchronous image model
 * returns. The URL is validated and only an existing science-poem item can be
 * updated; arbitrary resource fields are not accepted here.
 */
export async function POST(request: Request) {
  let body: { id?: unknown; coverUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const coverUrl = typeof body.coverUrl === "string" ? body.coverUrl.trim() : "";
  if (!id || !coverUrl) {
    return NextResponse.json({ error: "缺少资料 ID 或封面地址" }, { status: 400 });
  }

  try {
    const synced = await persistSciencePoetryCoverUrl(id, coverUrl);
    if (!synced) return NextResponse.json({ error: "未找到可同步的科学诗或封面地址无效" }, { status: 404 });
    return NextResponse.json({ itemId: synced.itemId, title: synced.title, coverUrl: synced.coverUrl, synced: true });
  } catch {
    return NextResponse.json({ error: "封面暂时无法写入资料库，请稍后重试" }, { status: 503 });
  }
}
