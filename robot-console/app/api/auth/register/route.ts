import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {normalizeUsername} from "@/lib/username";

export async function POST(request: Request) {
  const reply = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto");
  let publicOrigin;
  try { publicOrigin = new URL(`${protocol === "https" || protocol === "http" ? protocol + ":" : requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`).origin; }
  catch { return reply({ error: "注册请求地址无效" }, 400); }
  if (origin && origin !== publicOrigin) return reply({ error: "请从本网站的注册页面创建账号" }, 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return reply({ error: "注册请求格式无效" }, 415);
  if (Number(request.headers.get("content-length")) > 4096) return reply({ error: "注册内容过长" }, 413);

  let value: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 4096) return reply({ error: "注册内容过长" }, 413);
    value = JSON.parse(text);
  } catch { return reply({ error: "注册请求格式无效" }, 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return reply({ error: "请填写姓名、手机号和密码" }, 400);
  const body = value as Record<string, unknown>;
  if (body.acceptedPolicies !== true) return reply({ error: "请先阅读并同意用户协议和隐私政策" }, 400);
  if (typeof body.name !== "string" || typeof body.phone !== "string" || typeof body.password !== "string") return reply({ error: "请填写姓名、手机号和密码" }, 400);
  const name = body.name.trim();
  const phone = body.phone.trim();
  const password = body.password;
  const username = body.username === undefined || body.username === "" ? null : normalizeUsername(body.username);
  if (body.username !== undefined && body.username !== "" && !username) return reply({error: "用户名需为 2 至 24 位中文、字母、数字或下划线，以中文或字母开头。"}, 400);
  if (!name || name.length > 50 || /[\u0000-\u001f\u007f]/u.test(name)) return reply({ error: "姓名或称呼请填写 1 至 50 个字" }, 400);
  if (!/^1[3-9]\d{9}$/.test(phone)) return reply({ error: "请填写有效的 11 位手机号码" }, 400);
  const accountType = body.accountType;
  if (accountType !== "PARENT" && accountType !== "TEACHER") return reply({ error: "请选择家长或老师身份" }, 400);
  if (accountType === "TEACHER" && (typeof body.teacherCode !== "string" || body.teacherCode !== (process.env.TEACHER_REGISTRATION_CODE ?? "guokeey"))) return reply({ error: "老师注册码不正确，请向园方确认" }, 400);
  if (password.length < 8) return reply({ error: "密码至少需要 8 位" }, 400);
  // bcrypt only considers the first 72 bytes; reject rather than silently truncate.
  if (Buffer.byteLength(password, "utf8") > 72) return reply({ error: "密码过长，请缩短一些（英文和数字最多 72 位）" }, 400);

  try {
    if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) return reply({ error: "该手机号已注册，请直接登录" }, 409);
    if (username && await prisma.user.findUnique({where: {username}, select: {id: true}})) return reply({error: "该用户名已被使用，请换一个。"}, 409);
    const user = await prisma.user.create({
      // Preserve the legacy internal identifier without exposing email features.
      data: { name, phone, username, email: `${phone}@accounts.local.invalid`, accountType, identityVerified: accountType === "TEACHER", phoneVerified: false, passwordHash: await bcrypt.hash(password, 12), role: "USER" },
      select: { id: true, name: true, username: true, phone: true, role: true, accountType: true, identityVerified: true },
    });
    try { await createSession(user); }
    catch { return reply({ registered: true, requiresLogin: true }, 201); }
    return reply({ registered: true, user }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return reply({ error: "该手机号或用户名已注册，请直接登录或更换用户名。" }, 409);
    return reply({ error: "注册服务暂时无法连接，请稍后重试" }, 503);
  }
}
