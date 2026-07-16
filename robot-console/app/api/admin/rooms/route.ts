import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function slugify(text: string) {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || `room-${Date.now()}`
  );
}

export async function POST(request: Request) {
  const admin = await requireAdmin();

  if (!admin) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    title?: string;
    summary?: string;
    description?: string;
  };

  const name = body.title?.trim();

  if (!name) {
    return NextResponse.json({ error: "请填写功能室名称" }, { status: 400 });
  }

  const room = body.id
    ? await prisma.functionRoom.update({
        where: { id: body.id },
        data: {
          name,
          summary: body.summary ?? "",
          description: body.description ?? body.summary ?? "",
        },
      })
    : await prisma.functionRoom.create({
        data: {
          name,
          slug: slugify(name),
          summary: body.summary ?? "",
          description: body.description ?? body.summary ?? "",
        },
      });

  return NextResponse.json({ room });
}
