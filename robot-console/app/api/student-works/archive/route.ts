import { NextResponse } from "next/server";
import { getPublicActor, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser() ?? await getPublicActor();

  let works;
  try {
    works = await prisma.studentWork.findMany({
      where: session.role === "ADMIN" ? {} : { ownerId: session.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { growthRecords: { orderBy: { createdAt: "asc" }, take: 100 } },
    });
  } catch {
    return NextResponse.json({ records: [] });
  }

  return NextResponse.json({ records: works.map((work) => ({
    workId: work.id,
    title: work.title,
    status: work.status,
    visibility: work.visibility,
    createdAt: work.createdAt.toISOString(),
    growth: work.growthRecords.map((record) => ({
      id: record.id,
      stage: record.stage,
      note: record.note,
      createdAt: record.createdAt.toISOString(),
    })),
  })) });
}
