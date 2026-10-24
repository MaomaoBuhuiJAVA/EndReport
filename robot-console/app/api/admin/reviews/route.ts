import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getFreshSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await getFreshSessionUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "只有审核管理员可以查看投稿" }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "PENDING";
    const pageText = params.get("page") ?? "1";
    const page = Number(pageText);
    const query = (params.get("q") ?? "").trim();
    if (!["ALL", "PENDING", "APPROVED", "REJECTED"].includes(status) || !/^\d+$/u.test(pageText) || !Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 100) {
      return NextResponse.json({ error: "筛选条件无效" }, { status: 400 });
    }

    const baseWhere: Prisma.StudentWorkWhereInput = query ? { OR: [
      { title: { contains: query, mode: "insensitive" } },
      { studentLabel: { contains: query, mode: "insensitive" } },
      { owner: { name: { contains: query, mode: "insensitive" } } },
    ] } : {};
    const where: Prisma.StudentWorkWhereInput = { ...baseWhere, ...(status !== "ALL" ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : {}) };
    const pageSize = 12;
    const [works, total, groups] = await Promise.all([
      prisma.studentWork.findMany({
        where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
        select: {
          id: true, title: true, description: true, studentLabel: true, fileName: true,
          mimeType: true, fileSize: true, mediaUrl: true, thumbnailUrl: true,
          status: true, visibility: true, reviewNote: true, libraryDocumentId: true,
          createdAt: true, updatedAt: true, reviewedAt: true,
          owner: { select: { name: true } }, reviewer: { select: { name: true } },
        },
      }),
      prisma.studentWork.count({ where }),
      prisma.studentWork.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    ]);
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const group of groups) counts[group.status] = group._count._all;
    return NextResponse.json({ works, counts, total, page, pageSize }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "审核列表暂时无法加载，请稍后重试" }, { status: 503, headers: privateHeaders });
  }
}
