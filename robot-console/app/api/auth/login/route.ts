import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {normalizeUsername} from "@/lib/username";

export async function POST(request: Request) {
  const reply = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const requestUrl = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto");
  let publicOrigin: string;
  try { publicOrigin = new URL(`${protocol === "https" || protocol === "http" ? protocol + ":" : requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`).origin; }
  catch { return reply({ error: "登录请求地址无效" }, 400); }
  const origin = request.headers.get("origin");
  if (origin && origin !== publicOrigin) return reply({ error: "请从本网站的登录页面登录" }, 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return reply({ error: "登录请求格式无效" }, 415);
  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 4096) return reply({ error: "登录内容过长" }, 413);
    body = JSON.parse(text);
  } catch { return reply({ error: "登录请求格式无效" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "请输入用户名或手机号和密码" }, 400);
  const value = body as Record<string, unknown>;
  if (value.acceptedPolicies !== true) return reply({ error: "请先阅读并同意用户协议和隐私政策" }, 400);
  const identifier = value.identifier ?? value.phone;
  if (typeof identifier !== "string" || typeof value.password !== "string") return reply({ error: "请输入用户名或手机号和密码" }, 400);
  const phone = /^1[3-9]\d{9}$/u.test(identifier.trim()) ? identifier.trim() : null;
  const username = phone ? null : normalizeUsername(identifier);
  const password = value.password;
  if ((!phone && !username) || !password || Buffer.byteLength(password, "utf8") > 128) return reply({ error: "请填写有效的用户名或手机号和密码" }, 400);
  try {
    const user = await prisma.user.findUnique({ where: phone ? {phone} : {username: username!} });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return reply({ error: "用户名、手机号或密码不正确" }, 401);
    const sessionUser = { id: user.id, name: user.name, username: user.username, phone: user.phone, role: user.role, accountType: user.accountType, identityVerified: user.identityVerified };
    await prisma.user.update({where: {id: user.id}, data: {lastLoginAt: new Date(), lastLoginMethod: "password"}});
    await createSession({...sessionUser, sessionVersion: user.sessionVersion});
    return reply({ user: sessionUser }, 200);
  } catch { return reply({ error: "登录服务暂时无法连接，请稍后重试" }, 503); }
}
