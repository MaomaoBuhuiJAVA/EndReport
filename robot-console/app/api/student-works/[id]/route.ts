import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function canView(work: { ownerId: string; status: string; visibility: string }, user: Awaited<ReturnType<typeof getSessionUser>>) {
  return work.status === "APPROVED" && work.visibility === "PUBLIC" || Boolean(user && (user.role === "ADMIN" || user.id === work.ownerId));
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSessionUser();
  let work;
  try {
    work = await prisma.studentWork.findUnique({
      where: { id },
      include: {
        _count: { select: { likes: true, comments: true } },
        comments: { orderBy: { createdAt: "asc" }, take: 100, include: { author: { select: { id: true, name: true, role: true } } } },
        growthRecords: { orderBy: { createdAt: "asc" }, take: 100 },
      },
    });
  } catch {
    return NextResponse.json({ error: "作品暂时无法查看，请稍后重试" }, { status: 503 });
  }

  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  if (!canView(work, session)) return NextResponse.json({ error: "作品尚未公开" }, { status: 404 });

  const privateView = Boolean(session && (session.role === "ADMIN" || session.id === work.ownerId));
  const comments = work.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    authorName: comment.author.role === "ADMIN" ? comment.author.name : "参与者",
  }));

  return NextResponse.json({
    work: {
      id: work.id,
      title: work.title,
      description: work.description,
      studentLabel: work.studentLabel,
      fileName: work.fileName,
      mimeType: work.mimeType,
      fileSize: work.fileSize,
      mediaUrl: work.mediaUrl,
      thumbnailUrl: work.thumbnailUrl,
      status: work.status,
      visibility: work.visibility,
      ...(privateView ? { ownerId: work.ownerId, reviewNote: work.reviewNote, libraryDocumentId: work.libraryDocumentId } : {}),
      createdAt: work.createdAt.toISOString(),
      reviewedAt: work.reviewedAt?.toISOString() ?? null,
      likesCount: work._count.likes,
      commentsCount: work._count.comments,
      comments,
      growthRecords: privateView ? work.growthRecords.map((record) => ({ ...record, createdAt: record.createdAt.toISOString() })) : [],
    },
  });
}
