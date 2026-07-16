import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const categories = new Set([
  "BASIC_INFO",
  "QUALIFICATION",
  "HONOR",
  "COURSE",
  "STAFF",
  "SPEECH",
  "POLICY",
  "ARCHIVE",
]);

function chunks(title: string, content: string) {
  const result = [];
  for (let index = 0; index < content.length; index += 900) {
    result.push({
      title: `${title} ${result.length + 1}`,
      content: content.slice(index, index + 900),
      keywords: title,
    });
  }
  return result.length ? result : [{ title, content, keywords: title }];
}

export async function POST(request: Request) {
  const admin = await requireAdmin();

  if (!admin) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    category?: string;
    summary?: string;
    content?: string;
  };

  const title = body.title?.trim();
  const content = body.content?.trim();
  const category = categories.has(body.category ?? "") ? body.category : "ARCHIVE";

  if (!title || !content) {
    return NextResponse.json({ error: "请填写标题和正文" }, { status: 400 });
  }

  const document = await prisma.knowledgeDocument.create({
    data: {
      title,
      content,
      summary: body.summary?.trim() || content.slice(0, 300),
      category: category as "ARCHIVE",
      uploadedBy: admin.id,
      chunks: {
        create: chunks(title, content),
      },
    },
  });

  return NextResponse.json({ document: { ...document, category: document.category.toString() } });
}
