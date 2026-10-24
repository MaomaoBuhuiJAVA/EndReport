import {NextResponse} from "next/server";
import {SmsError} from "./sms/service";
export class AuthRequestError extends Error {constructor(message: string, public status = 400) {super(message);}}
export const authReply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "private, no-store"}});
export function authError(error: unknown) {
  if (error instanceof AuthRequestError || error instanceof SmsError) {
    const response = authReply({error: error.message}, error.status);
    if (error instanceof SmsError && error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
    return response;
  }
  return authReply({error: "账号服务暂时无法连接，请稍后重试。"}, 503);
}
export function checkAuthOrigin(request: Request) {
  const url = new URL(request.url); const protocol = request.headers.get("x-forwarded-proto");
  let origin: string;
  try {origin = new URL(`${protocol === "https" || protocol === "http" ? protocol + ":" : url.protocol}//${request.headers.get("host") || url.host}`).origin;}
  catch {throw new AuthRequestError("请求地址无效。");}
  if ((request.headers.get("origin") && request.headers.get("origin") !== origin) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new AuthRequestError("请从本网站的账号页面操作。", 403);
}
export async function readAuthJson(request: Request) {
  checkAuthOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new AuthRequestError("请求格式无效。", 415);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 4096) throw new AuthRequestError("提交内容过长。", 413);
  let body: unknown;
  try {body = JSON.parse(text);} catch {throw new AuthRequestError("请求格式无效。");}
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AuthRequestError("请填写完整的账号信息。");
  return body as Record<string, unknown>;
}
export function authPhone(value: unknown) {
  if (typeof value !== "string" || !/^1[3-9]\d{9}$/u.test(value.trim())) throw new AuthRequestError("请输入有效的 11 位手机号码。");
  return value.trim();
}
export function authPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || Buffer.byteLength(value, "utf8") > 72) throw new AuthRequestError("密码至少 8 位，且不能超过 72 字节。");
  return value;
}
export function smsProof(body: Record<string, unknown>, phone: string, purpose: import("./sms/config").SmsPurpose, principal?: string) {
  if (typeof body.challengeId !== "string" || typeof body.code !== "string") throw new AuthRequestError("请获取并填写短信验证码。");
  return {challengeId: body.challengeId, code: body.code, phone, purpose, ...(principal ? {principal} : {})};
}
