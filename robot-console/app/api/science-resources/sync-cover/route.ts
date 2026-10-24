import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generated covers are persisted by the server that generated them. */
export async function POST(request: Request) {
  void request;
  return NextResponse.json({error: "此封面同步接口已停用，请通过生成封面保存图片"}, {status: 410});
}
