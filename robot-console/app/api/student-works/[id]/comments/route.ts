import { NextResponse } from "next/server";
import { getPublicActor, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function canInteract(work: { ownerId: string; status: string; visibility: string }, user: Awaited<ReturnType<typeof getSessionUser>>) {
  return work.status === "APPROVED" && work.visibility === "PUBLIC" || Boolean(user && (user.role === "ADMIN" || user.id === work.ownerId));
}

async function loadWork(id: string) {
  return prisma.studentWork.findUnique({ where: { id }, select: { id: true, ownerId: true, status: true, visibility: true } });
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSessionUser();
  let work;
  try {
    work = await loadWork(id);
  } catch {
    return NextResponse.json({ comments: [] });
  }
  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  if (!canInteract(work, session)) return NextResponse.json({ error: "作品尚未公开" }, { status: 404 });

  let comments;
  try {
    comments = await prisma.studentWorkComment.findMany({
      where: { workId: id },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { author: { select: { name: true, role: true } } },
    });
  } catch {
    return NextResponse.json({ comments: [] });
  }
  return NextResponse.json({ comments: comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    authorName: comment.author.role === "ADMIN" ? comment.author.name : "参与者",
    createdAt: comment.createdAt.toISOString(),
  })) });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSessionUser() ?? await getPublicActor();
  const { id } = await params;
  let work;
  try {
    work = await loadWork(id);
  } catch {
    return NextResponse.json({ error: "评论服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  if (!canInteract(work, session)) return NextResponse.json({ error: "作品尚未公开" }, { status: 404 });

  let body: { body?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const commentBody = body.body?.trim() ?? "";
  if (!commentBody || commentBody.length > 2000) {
    return NextResponse.json({ error: "评论不能为空且不能超过 2000 个字" }, { status: 400 });
  }

  let comment;
  try {
    comment = await prisma.studentWorkComment.create({ data: { workId: id, authorId: session.id, body: commentBody } });
  } catch {
    return NextResponse.json({ error: "评论服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  return NextResponse.json({ comment: { id: comment.id, body: comment.body, authorName: session.role === "ADMIN" ? session.name : "参与者", createdAt: comment.createdAt.toISOString() } }, { status: 201 });
}
