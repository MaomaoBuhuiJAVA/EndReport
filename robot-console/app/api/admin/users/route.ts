import {NextResponse} from "next/server";
import type {Prisma} from "@prisma/client";
import {getAdminSmsSession} from "@/lib/auth";
import {prisma} from "@/lib/prisma";

const privateHeaders = {"Cache-Control": "private, no-store"};

export async function GET(request: Request) {
  try {
    const admin = await getAdminSmsSession();
    if (!admin) return NextResponse.json({error: "请先通过管理员短信验证"}, {status: 401, headers: privateHeaders});
    const params = new URL(request.url).searchParams;
    const pageText = params.get("page") ?? "1";
    const page = Number(pageText);
    const query = (params.get("q") ?? "").trim();
    if (!/^\d+$/u.test(pageText) || !Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 100) {
      return NextResponse.json({error: "筛选条件无效"}, {status: 400, headers: privateHeaders});
    }
    const where: Prisma.UserWhereInput = query ? {OR: [
      {name: {contains: query, mode: "insensitive"}},
      {phone: {contains: query}},
      {username: {contains: query, mode: "insensitive"}},
    ]} : {};
    const pageSize = 20;
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: [{createdAt: "desc"}, {id: "desc"}], skip: (page - 1) * pageSize, take: pageSize,
        select: {id: true, name: true, username: true, phone: true, role: true, accountType: true, phoneVerified: true, createdAt: true, lastLoginAt: true, lastLoginMethod: true},
      }),
      prisma.user.count({where}),
    ]);
    return NextResponse.json({users, total, page, pageSize}, {headers: privateHeaders});
  } catch {
    return NextResponse.json({error: "用户列表暂时无法加载，请稍后重试"}, {status: 503, headers: privateHeaders});
  }
}
