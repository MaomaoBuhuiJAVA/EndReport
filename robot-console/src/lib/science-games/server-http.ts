import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { GameServerError } from "./server-repository";

const BODY_LIMIT = 4096;
export function gameReply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function gameError(error: unknown) {
  if (error instanceof GameServerError) return gameReply({ error: error.message }, error.status);
  return gameReply({ error: "科学游戏账号服务暂未就绪，请稍后重试。试玩记录仍保存在当前浏览器。" }, 503);
}
export async function gameUser(request?: Request) {
  const user = await getSessionUser();
  if (!user || user.id === "public-participant") throw new GameServerError("请先登录，再保存孩子的游戏记录。", 401);
  const expected = request?.headers.get("x-game-account-id");
  if (expected && expected !== user.id) throw new GameServerError("账号已切换，请刷新游戏记录后再试。", 409);
  return user;
}

export function gameWriteOrigin(request: Request) {
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto");
  let expected: string;
  try { expected = new URL(`${protocol === "http" || protocol === "https" ? `${protocol}:` : url.protocol}//${request.headers.get("host") || url.host}`).origin; }
  catch { throw new GameServerError("请求地址无效。"); }
  const origin = request.headers.get("origin");
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") throw new GameServerError("请从本网站的游戏页面操作。", 403);
}

export async function readGameJson(request: Request) {
  gameWriteOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new GameServerError("请使用 JSON 格式提交。", 415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/u.test(length) || Number(length) > BODY_LIMIT)) throw new GameServerError("提交内容过长。", 413);
  // Stream a bounded body, including requests with missing/incorrect Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new GameServerError("提交内容不能为空。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT) { await reader.cancel(); throw new GameServerError("提交内容过长。", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new GameServerError("提交内容格式无效。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GameServerError("请提交有效的游戏信息。");
  return value as Record<string, unknown>;
}
