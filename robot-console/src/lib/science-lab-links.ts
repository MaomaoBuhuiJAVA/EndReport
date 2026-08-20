import type { ScienceKnowledgeSummary } from "@/lib/science-types";

export type ScienceLabLink = {
  id: string;
  title: string;
  href: string;
};

// Structured agent results can contain Dify's internal document UUID instead
// of a catalog item ID. Only the IDs emitted by the exported LAB records are
// safe to turn into a `/lab?item=` route here.
const PACKAGED_LAB_ID_PATTERN = /^(?:LAB:)?(?:EXP|STORY|POEM)-[a-f0-9]{12}$/i;

export function scienceLabId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!PACKAGED_LAB_ID_PATTERN.test(candidate)) return null;
  const normalized = candidate.replace(/^LAB:/i, "");
  const separator = normalized.indexOf("-");
  return `${normalized.slice(0, separator).toUpperCase()}-${normalized.slice(separator + 1).toLowerCase()}`;
}

export function scienceLabHrefForId(value: unknown): string | null {
  const id = scienceLabId(value);
  return id ? `/lab?item=${encodeURIComponent(id)}` : null;
}

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

export function buildScienceLabLinks(chunks: SearchChunk[], query = "", limit = 3): ScienceLabLink[] {
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
    if (links.length === Math.max(1, limit)) break;
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
