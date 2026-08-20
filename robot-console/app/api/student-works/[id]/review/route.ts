import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function chunks(title: string, content: string) {
  const result = [];
  for (let index = 0; index < content.length; index += 900) {
    result.push({ title: `${title} ${result.length + 1}`, content: content.slice(index, index + 900), keywords: title });
  }
  return result.length ? result : [{ title, content, keywords: title }];
}

export async function POST(request: Request, { params }: Params) {
  const teacher = await requireAdmin();
  if (!teacher) return NextResponse.json({ error: "需要教师权限" }, { status: 403 });

  const { id } = await params;
  let body: { action?: string; visibility?: string; reviewNote?: string; addToLibrary?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "审核动作无效" }, { status: 400 });
  }
  const reviewNote = body.reviewNote?.trim() ?? "";
  if (reviewNote.length > 2000) return NextResponse.json({ error: "审核意见不能超过 2000 个字" }, { status: 400 });

  let work;
  try {
    work = await prisma.studentWork.findUnique({ where: { id } });
  } catch {
    return NextResponse.json({ error: "审核服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });

  const reviewedAt = new Date();
  if (body.action === "reject") {
    let updated;
    try {
      updated = await prisma.studentWork.update({
        where: { id },
        data: { status: "REJECTED", visibility: "TEACHER_ONLY", reviewNote: reviewNote || null, reviewedBy: teacher.id, reviewedAt },
      });
    } catch {
      return NextResponse.json({ error: "审核服务暂时不可用，请稍后重试" }, { status: 503 });
    }
    return NextResponse.json({ work: updated });
  }

  const visibility = body.visibility === "public" ? "PUBLIC" : "TEACHER_ONLY";
  let libraryDocumentId = work.libraryDocumentId;
  if (body.addToLibrary === true && !libraryDocumentId) {
    const content = [
      `作品标题：${work.title}`,
      work.description ? `作品说明：${work.description}` : "",
      `媒体地址：${work.mediaUrl}`,
    ].filter(Boolean).join("\n");
    try {
      const document = await prisma.knowledgeDocument.create({
        data: {
          title: work.title,
          summary: work.description || `学生作品：${work.title}`,
          content,
          sourcePath: `student-work:${work.id}`,
          fileType: work.mimeType,
          uploadedBy: teacher.id,
          category: "ARCHIVE",
          chunks: { create: chunks(work.title, content) },
        },
        select: { id: true },
      });
      libraryDocumentId = document.id;
    } catch {
      return NextResponse.json({ error: "资源入库失败，作品暂未审核通过" }, { status: 503 });
    }
  }

  let updated;
  try {
    updated = await prisma.studentWork.update({
      where: { id },
      data: {
        status: "APPROVED",
        visibility,
        reviewNote: reviewNote || null,
        reviewedBy: teacher.id,
        reviewedAt,
        ...(libraryDocumentId ? { libraryDocumentId } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "审核服务暂时不可用，请稍后重试" }, { status: 503 });
  }

  return NextResponse.json({ work: updated });
}
