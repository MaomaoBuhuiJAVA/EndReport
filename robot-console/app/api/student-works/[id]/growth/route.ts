import { NextResponse } from "next/server";
import { getPublicActor, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function loadWork(id: string) {
  return prisma.studentWork.findUnique({ where: { id }, select: { id: true, ownerId: true } });
}

function canEdit(work: { ownerId: string }, user: Awaited<ReturnType<typeof getSessionUser>>) {
  return Boolean(user && (user.role === "ADMIN" || user.id === work.ownerId));
}

export async function GET(_request: Request, { params }: Params) {
  const session = await getSessionUser() ?? await getPublicActor();
  const { id } = await params;
  let work;
  try {
    work = await loadWork(id);
  } catch {
    return NextResponse.json({ records: [] });
  }
  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  if (!canEdit(work, session)) return NextResponse.json({ error: "没有查看权限" }, { status: 403 });
  let records;
  try {
    records = await prisma.studentGrowthRecord.findMany({ where: { workId: id }, orderBy: { createdAt: "asc" }, take: 100 });
  } catch {
    return NextResponse.json({ records: [] });
  }
  return NextResponse.json({ records: records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString() })) });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSessionUser() ?? await getPublicActor();
  const { id } = await params;
  let work;
  try {
    work = await loadWork(id);
  } catch {
    return NextResponse.json({ error: "成长档案服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  if (!work) return NextResponse.json({ error: "作品不存在" }, { status: 404 });
  if (!canEdit(work, session)) return NextResponse.json({ error: "没有编辑权限" }, { status: 403 });

  let body: { stage?: string; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const stage = body.stage?.trim() ?? "";
  const note = body.note?.trim() ?? "";
  if (!stage || !note) return NextResponse.json({ error: "请填写成长阶段和记录内容" }, { status: 400 });
  if (stage.length > 80 || note.length > 3000) return NextResponse.json({ error: "成长记录内容过长" }, { status: 400 });

  let record;
  try {
    record = await prisma.studentGrowthRecord.create({ data: { workId: id, authorId: session.id, stage, note } });
  } catch {
    return NextResponse.json({ error: "成长档案服务暂时不可用，请稍后重试" }, { status: 503 });
  }
  return NextResponse.json({ record: { ...record, createdAt: record.createdAt.toISOString() } }, { status: 201 });
}
