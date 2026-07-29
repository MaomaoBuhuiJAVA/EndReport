import type { ScienceKnowledgeSummary } from "@/lib/science-types";

export type ScienceLabLink = {
  id: string;
  title: string;
  href: string;
};

type SearchChunk = {
  id: string;
  documentId?: string | null;
  title: string;
};

export function buildScienceLabLinks(chunks: SearchChunk[]): ScienceLabLink[] {
  const seen = new Set<string>();
  const links: ScienceLabLink[] = [];

  for (const chunk of chunks) {
    if (
      !chunk.documentId ||
      !chunk.id.startsWith("science-") ||
      chunk.id !== `science-${chunk.documentId}` ||
      seen.has(chunk.documentId)
    ) {
      continue;
    }

    seen.add(chunk.documentId);
    links.push({
      id: chunk.documentId,
      title: chunk.title,
      href: `/lab?item=${encodeURIComponent(chunk.documentId)}`,
    });
    if (links.length === 3) break;
  }

  return links;
}

export function findScienceSummaryFromSearch(
  search: string,
  summaries: ScienceKnowledgeSummary[],
): ScienceKnowledgeSummary | null {
  const itemId = new URLSearchParams(search).get("item")?.trim();
  return itemId ? summaries.find((item) => item.id === itemId) ?? null : null;
}
