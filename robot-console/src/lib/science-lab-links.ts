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
  document?: {
    title?: string | null;
  };
};

function namedResourceTitles(query: string) {
  return Array.from(query.matchAll(/[《〈「“\"]\s*([^》〉」”\"]+?)\s*[》〉」”\"]/g))
    .map((match) => match[1]?.trim())
    .filter((title): title is string => Boolean(title));
}

function isScienceChunk(chunk: SearchChunk) {
  return (
    chunk.id.startsWith("science-") ||
    chunk.document?.title?.startsWith("科小贝实验室：") === true
  );
}

export function buildScienceLabLinks(chunks: SearchChunk[], query = ""): ScienceLabLink[] {
  const namedTitles = namedResourceTitles(query);
  const seen = new Set<string>();
  const links: ScienceLabLink[] = [];

  for (const chunk of chunks) {
    if (
      !chunk.documentId ||
      !isScienceChunk(chunk) ||
      seen.has(chunk.documentId)
    ) {
      continue;
    }

    if (namedTitles.length && !namedTitles.some((title) => chunk.title.includes(title))) {
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
