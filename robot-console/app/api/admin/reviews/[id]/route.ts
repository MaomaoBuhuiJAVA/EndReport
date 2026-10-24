import { NextResponse } from "next/server";
import { getFreshSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class ReviewConflict extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getFreshSessionUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "只有审核管理员可以处理投稿" }, { status: 403 });

    let body: Record<string, unknown>;
    try {
      const value = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid body");
      body = value;
    } catch { return NextResponse.json({ error: "审核请求格式无效" }, { status: 400 }); }

    if (body.action !== "approve" && body.action !== "reject") return NextResponse.json({ error: "审核动作无效" }, { status: 400 });
    if (typeof body.expectedUpdatedAt !== "string" || !Number.isFinite(new Date(body.expectedUpdatedAt).getTime())) return NextResponse.json({ error: "请刷新投稿后重新审核" }, { status: 400 });
    if (body.reviewNote !== undefined && typeof body.reviewNote !== "string") return NextResponse.json({ error: "审核意见格式无效" }, { status: 400 });
    const note = typeof body.reviewNote === "string" ? body.reviewNote.trim() : "";
    if (note.length > 2000) return NextResponse.json({ error: "审核意见不能超过 2000 个字" }, { status: 400 });
    if (body.action === "reject" && !note) return NextResponse.json({ error: "请填写退回原因，方便投稿人修改" }, { status: 400 });
    if (body.visibility !== undefined && !["teacher", "public"].includes(String(body.visibility))) return NextResponse.json({ error: "展示范围无效" }, { status: 400 });
    if (body.addToLibrary !== undefined && typeof body.addToLibrary !== "boolean") return NextResponse.json({ error: "资料入库选项无效" }, { status: 400 });
    if (body.action === "approve" && body.addToLibrary === true && body.visibility !== "public") return NextResponse.json({ error: "园本资料库用于公开浏览和 AI 参考，仅公开投稿可以加入" }, { status: 400 });

    const { id } = await params;
    const approving = body.action === "approve";
    const status = approving ? "APPROVED" : "REJECTED";
    const visibility = approving && body.visibility === "public" ? "PUBLIC" : "TEACHER_ONLY";
    await prisma.$transaction(async (tx) => {
      const work = await tx.studentWork.findUnique({ where: { id } });
      if (!work) throw new ReviewConflict("投稿不存在或已被删除", 404);
      if (work.status !== "PENDING") throw new ReviewConflict("这份投稿已经处理过了，请刷新列表", 409);
      const update = await tx.studentWork.updateMany({
        where: { id, status: "PENDING", updatedAt: new Date(body.expectedUpdatedAt as string) },
        data: { status, visibility, reviewNote: note || null, reviewedBy: user.id, reviewedAt: new Date() },
      });
      if (update.count !== 1) throw new ReviewConflict("投稿内容或审核状态已更新，请刷新后重试", 409);

      if (approving && body.addToLibrary === true && !work.libraryDocumentId) {
        const content = [`作品标题：${work.title}`, work.description ? `作品说明：${work.description}` : "", `媒体地址：${work.mediaUrl}`].filter(Boolean).join("\n");
        const chunks = Array.from({ length: Math.max(1, Math.ceil(content.length / 900)) }, (_, index) => ({ title: `${work.title} ${index + 1}`, content: content.slice(index * 900, (index + 1) * 900), keywords: work.title }));
        const document = await tx.knowledgeDocument.create({
          data: { title: work.title, summary: work.description || `已审核作品：${work.title}`, content,
            sourcePath: `student-work:${work.id}`, fileType: work.mimeType, uploadedBy: user.id,
            category: "ARCHIVE", chunks: { create: chunks } },
          select: { id: true },
        });
        await tx.studentWork.update({ where: { id }, data: { libraryDocumentId: document.id } });
      }
    });
    return NextResponse.json({ ok: true, status, visibility });
  } catch (error) {
    if (error instanceof ReviewConflict) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "审核未完成，请稍后重试" }, { status: 503 });
  }
}
