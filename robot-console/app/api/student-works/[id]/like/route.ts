import { NextResponse } from "next/server";
import { getPublicActor, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const session = await getSessionUser() ?? await getPublicActor();
  const { id } = await params;
  let work;
  try {
    work = await prisma.studentWork.findUnique({ where: { id }, select: { ownerId: true, status: true, visibility: true } });
  } catch {
    return NextResponse.json({ error: "点赞服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  const visible = work.status === "APPROVED" && work.visibility === "PUBLIC" || session.role === "ADMIN" || work.ownerId === session.id;
  if (!visible) return NextResponse.json({ error: "作品尚未公开" }, { status: 404 });

  let existing;
  try {
    existing = await prisma.studentWorkLike.findUnique({ where: { workId_userId: { workId: id, userId: session.id } } });
  } catch {
    return NextResponse.json({ error: "点赞服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  let liked = false;
  try {
    if (existing) {
      await prisma.studentWorkLike.delete({ where: { id: existing.id } });
    } else {
      await prisma.studentWorkLike.create({ data: { workId: id, userId: session.id } });
      liked = true;
    }
  } catch {
    return NextResponse.json({ error: "点赞服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  let count;
  try {
    count = await prisma.studentWorkLike.count({ where: { workId: id } });
  } catch {
    return NextResponse.json({ error: "点赞服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  return NextResponse.json({ liked, count });
}
