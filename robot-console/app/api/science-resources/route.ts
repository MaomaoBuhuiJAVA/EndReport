import { NextResponse } from "next/server";
import {
  getScienceKnowledgeItem,
  getScienceKnowledgeSummaries,
  searchScienceSummaries,
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

  const query = url.searchParams.get("q")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";
  const topic = url.searchParams.get("topic")?.trim() ?? "";
  const age = url.searchParams.get("age")?.trim() ?? "";
  const resourceType = url.searchParams.get("resourceType")?.trim() ?? "";
  const hasSearch = Boolean(query || category || topic || age || resourceType);
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 10;

  const summaries = await getScienceKnowledgeSummaries();
  const searchQuery = [query, category, topic, age, resourceType].filter(Boolean).join(" ");
  const matchedSummaries = hasSearch
    ? searchScienceSummaries(summaries, searchQuery, limit).filter(
        (item) => !topic || item.topic === topic,
      )
    : summaries;
  const selectedSummaries = hasSearch ? matchedSummaries.slice(0, limit) : matchedSummaries;
  const items = hasSearch
    ? await Promise.all(
        selectedSummaries.map(async (summary) => (await getScienceKnowledgeItem(summary.id)) ?? summary),
      )
    : selectedSummaries;

  return NextResponse.json(
    {
      items,
      count: items.length,
      ...(hasSearch
        ? { query, filters: { category, topic, age, resourceType, limit } }
        : {}),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
