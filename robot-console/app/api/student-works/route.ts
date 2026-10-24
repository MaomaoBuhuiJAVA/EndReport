import { persistOssUpload } from "@/lib/oss-upload";
import { NextResponse } from "next/server";
import { getFreshSessionUser, getPublicActor, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveMediaUrl } from "@/lib/media-links";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedMime = /^(image|video|audio)\//i;
const allowedDocumentMime = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

type WorkWithCounts = {
  id: string;
  title: string;
  description: string | null;
  studentLabel: string | null;
  ownerId: string;
  fileName: string;
  mimeType: string;
  fileSize?: number | null;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  status: string;
  visibility: string;
  reviewNote?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
  _count?: { likes: number; comments: number };
};

function serializeWork(work: WorkWithCounts, includePrivate = false) {
  return {
    id: work.id,
    title: work.title,
    description: work.description,
    studentLabel: work.studentLabel,
    fileName: work.fileName,
    mimeType: work.mimeType,
    fileSize: work.fileSize ?? null,
    mediaUrl: resolveMediaUrl(work.mediaUrl),
    thumbnailUrl: work.thumbnailUrl ? resolveMediaUrl(work.thumbnailUrl) : null,
    status: work.status,
    visibility: work.visibility,
    ...(includePrivate ? { ownerId: work.ownerId, reviewNote: work.reviewNote ?? null } : {}),
    reviewedAt: work.reviewedAt?.toISOString() ?? null,
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt?.toISOString() ?? null,
    likesCount: work._count?.likes ?? 0,
    commentsCount: work._count?.comments ?? 0,
  };
}

function acceptsFile(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return false;
  if (allowedMime.test(file.type) || allowedDocumentMime.has(file.type)) return true;
  return /\.(png|jpe?g|gif|webp|svg|mp4|mov|webm|mp3|wav|m4a|pdf|docx?|pptx?)$/i.test(file.name);
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "public";
  const status = url.searchParams.get("status");

  let where: Record<string, unknown>;
  let includePrivate = false;

  if (scope === "review") {
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "需要教师权限" }, { status: 403 });
    }
    where = status ? { status } : { status: "PENDING" };
    includePrivate = true;
  } else if (scope === "mine") {
    const actor = session ?? await getPublicActor();
    where = { ownerId: actor.id, ...(status ? { status } : {}) };
    includePrivate = true;
  } else {
    // Public listing is intentionally narrow: approval and visibility are both required.
    where = { status: "APPROVED", visibility: "PUBLIC" };
  }

  let works;
  try {
    works = await prisma.studentWork.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { likes: true, comments: true } } },
    });
  } catch {
    // Keep the page usable while a newly added table is being migrated.
    return NextResponse.json({ works: [] });
  }

  return NextResponse.json({ works: (works as unknown as WorkWithCounts[]).map((work) => serializeWork(work, includePrivate)) });
}

export async function POST(request: Request) {
  let actor;
  try { actor = await getFreshSessionUser(); }
  catch { return NextResponse.json({ error: "暂时无法核对投稿权限，请稍后重试" }, { status: 503 }); }
  if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  // Teacher/parent verification is a separate workflow; ordinary signup never grants it.
  if (actor.role !== "ADMIN" && !(actor.identityVerified && (actor.accountType === "TEACHER" || actor.accountType === "PARENT"))) return NextResponse.json({ error: "投稿需要园方核验教师或本园家长身份，请联系园方申请" }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "上传格式无效" }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const studentLabel = String(form.get("studentLabel") ?? "").trim();
  const fileValue = form.get("file");

  if (!title || !(fileValue instanceof File)) {
    return NextResponse.json({ error: "请填写作品标题并选择文件" }, { status: 400 });
  }
  if (title.length > 120) return NextResponse.json({ error: "作品标题不能超过 120 个字" }, { status: 400 });
  if (description.length > 5000) return NextResponse.json({ error: "作品说明不能超过 5000 个字" }, { status: 400 });
  if (studentLabel.length > 80) return NextResponse.json({ error: "班级标识不能超过 80 个字" }, { status: 400 });
  if (!acceptsFile(fileValue)) {
    return NextResponse.json({ error: "文件类型不支持或文件超过 20MB" }, { status: 400 });
  }

  let stored: { url: string };
  try {
    stored = await persistOssUpload(fileValue, {folder: `student-works/${actor.id}`, maxBytes: MAX_FILE_SIZE});
  } catch {
    return NextResponse.json({ error: "文件暂时无法保存，请稍后重试" }, { status: 503 });
  }

  let work;
  try {
    work = await prisma.studentWork.create({
      data: {
        ownerId: actor.id,
        title,
        description: description || null,
        studentLabel: studentLabel || null,
        fileName: fileValue.name,
        mimeType: fileValue.type || "application/octet-stream",
        fileSize: fileValue.size,
        mediaUrl: stored.url,
        thumbnailUrl: allowedMime.test(fileValue.type) && fileValue.type.startsWith("image/") ? stored.url : null,
        status: "PENDING",
        visibility: "TEACHER_ONLY",
      },
      include: { _count: { select: { likes: true, comments: true } } },
    });
  } catch {
    return NextResponse.json({ error: "作品暂时无法保存，请稍后重试" }, { status: 503 });
  }

  return NextResponse.json({ work: serializeWork(work as unknown as WorkWithCounts, true) }, { status: 201 });
}
