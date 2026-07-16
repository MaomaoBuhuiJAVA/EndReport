import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const document = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      category: true,
      summary: true,
      content: true,
      fileType: true,
      updatedAt: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "资料不存在" }, { status: 404 });
  }

  return NextResponse.json({
    document: {
      ...document,
      category: document.category.toString(),
      updatedAt: document.updatedAt.toISOString(),
    },
  });
}
