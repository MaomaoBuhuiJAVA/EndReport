import { NextResponse } from "next/server";
import {
  getScienceKnowledgeItem,
  getScienceKnowledgeSummaries,
} from "@/lib/science-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("item")?.trim();

  if (itemId) {
    const item = await getScienceKnowledgeItem(itemId);
    if (!item) {
      return NextResponse.json({ error: "resource not found" }, { status: 404 });
    }

    return NextResponse.json(
      { item },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
    );
  }

  const items = await getScienceKnowledgeSummaries();
  return NextResponse.json(
    { items, count: items.length },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
