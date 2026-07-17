import fallbackPayload from "@/data/science-knowledge.json";
import { prisma } from "@/lib/prisma";
import type {
  ScienceKnowledgeItem,
  ScienceKnowledgeSummary,
  ScienceResource,
} from "@/lib/science-types";

const fallbackItems = fallbackPayload as unknown as ScienceKnowledgeItem[];

const knowledgeVersionSuffix = /\s*(?:[-_—]\s*\d+|[（(]\s*(?:\d+|[一二三四五六七八九十]+|初稿|初版|定稿|最终稿|终稿|修改稿|修订稿|送审稿)\s*[）)])\s*$/i;

function cleanKnowledgeName(value: string) {
  const extension = value.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? "";
  let stem = extension ? value.slice(0, -extension.length) : value;
  let previous = "";

  while (previous !== stem) {
    previous = stem;
    stem = stem.replace(knowledgeVersionSuffix, "").trim();
  }

  return `${stem}${extension}`;
}

function normalizeResources(
  item: Pick<ScienceKnowledgeItem, "id" | "baseId" | "semester" | "title" | "category" | "sourceFile">,
  resources: ScienceResource[],
) {
  const publicResources = resources.filter((resource) => resource.isPublic);
  const hasGuide = publicResources.some((resource) => resource.type === "教案资源");

  if (item.category === "科学实验（教师版）" && !hasGuide) {
    publicResources.push({
      id: item.id + "-GUIDE",
      type: "教案资源",
      knowledgeBaseId: item.baseId,
      semester: item.semester,
      title: item.title + " - 教师教案",
      publicPath: "",
      externalUrl: "",
      source: item.sourceFile,
      isPublic: true,
    });
  }

  return publicResources;
}

function toSummary(item: ScienceKnowledgeItem): ScienceKnowledgeSummary {
  const normalizedItem = {
    ...item,
    title: cleanKnowledgeName(item.title),
    sourceFile: cleanKnowledgeName(item.sourceFile),
  };
  const resources = normalizeResources(normalizedItem, item.resources);
  return {
    id: item.id,
    baseId: item.baseId,
    semester: item.semester,
    category: item.category,
    title: normalizedItem.title,
    ageLabel: item.ageLabel,
    topic: item.topic,
    author: item.author,
    excerpt: item.excerpt,
    tags: item.tags,
    resourceTypes: Array.from(new Set(resources.map((resource) => resource.type))),
    resources,
  };
}

function mapResource(resource: {
  id: string;
  resourceType: string;
  knowledgeBaseId: string;
  semester: string;
  title: string;
  publicPath: string;
  externalUrl: string;
  source: string;
  isPublic: boolean;
}): ScienceResource {
  return {
    id: resource.id,
    type: resource.resourceType as ScienceResource["type"],
    knowledgeBaseId: resource.knowledgeBaseId,
    semester: resource.semester,
    title: cleanKnowledgeName(resource.title),
    publicPath: resource.publicPath,
    externalUrl: resource.externalUrl,
    source: resource.source,
    isPublic: resource.isPublic,
  };
}

function mapItem(
  item: Omit<ScienceKnowledgeItem, "resources" | "resourceTypes">,
  resources: ScienceResource[],
): ScienceKnowledgeItem {
  const normalizedItem = {
    ...item,
    title: cleanKnowledgeName(item.title),
    sourceFile: cleanKnowledgeName(item.sourceFile),
  };
  const normalizedResources = normalizeResources(normalizedItem, resources);
  return {
    ...normalizedItem,
    category: item.category as ScienceKnowledgeItem["category"],
    resources: normalizedResources,
    resourceTypes: Array.from(new Set(normalizedResources.map((resource) => resource.type))),
  };
}

function normalizeFallbackItem(item: ScienceKnowledgeItem) {
  const normalizedItem = {
    ...item,
    title: cleanKnowledgeName(item.title),
    sourceFile: cleanKnowledgeName(item.sourceFile),
  };
  const resources = normalizeResources(normalizedItem, item.resources);
  return {
    ...normalizedItem,
    resources,
    resourceTypes: Array.from(new Set(resources.map((resource) => resource.type))),
  };
}

function groupResources(resources: ScienceResource[]) {
  const groups = new Map<string, ScienceResource[]>();
  for (const resource of resources) {
    const group = groups.get(resource.knowledgeBaseId) ?? [];
    group.push(resource);
    groups.set(resource.knowledgeBaseId, group);
  }
  return groups;
}

export async function getScienceKnowledgeSummaries(): Promise<ScienceKnowledgeSummary[]> {
  try {
    const items = await prisma.scienceKnowledgeItem.findMany({
      orderBy: { sortOrder: "asc" },
    });
    if (!items.length) return fallbackItems.map(toSummary);

    const resources = await prisma.scienceKnowledgeResource.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: "asc" },
    });
    const groups = groupResources(resources.map(mapResource));

    return items.map((item) =>
      toSummary(
        mapItem(
          {
            id: item.id,
            baseId: item.baseId,
            semester: item.semester,
            category: item.category as ScienceKnowledgeItem["category"],
            title: item.title,
            ageLabel: item.ageLabel,
            topic: item.topic,
            author: item.author,
            sourceFile: item.sourceFile,
            sourcePage: item.sourcePage,
            allocationBasis: item.allocationBasis,
            tags: item.tags,
            ingestStatus: item.ingestStatus,
            duplicateOf: item.duplicateOf,
            imageCount: item.imageCount,
            videoUrl: item.videoUrl,
            excerpt: item.excerpt,
            body: item.body,
          },
          groups.get(item.baseId) ?? [],
        ),
      ),
    );
  } catch {
    return fallbackItems.map(toSummary);
  }
}

export async function getScienceKnowledgeItem(id: string): Promise<ScienceKnowledgeItem | null> {
  try {
    const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
    if (!item) {
      const fallback = fallbackItems.find((entry) => entry.id === id);
      return fallback ? normalizeFallbackItem(fallback) : null;
    }

    const resources = await prisma.scienceKnowledgeResource.findMany({
      where: { knowledgeBaseId: item.baseId, isPublic: true },
      orderBy: { sortOrder: "asc" },
    });

    return mapItem(
      {
        id: item.id,
        baseId: item.baseId,
        semester: item.semester,
        category: item.category as ScienceKnowledgeItem["category"],
        title: item.title,
        ageLabel: item.ageLabel,
        topic: item.topic,
        author: item.author,
        sourceFile: item.sourceFile,
        sourcePage: item.sourcePage,
        allocationBasis: item.allocationBasis,
        tags: item.tags,
        ingestStatus: item.ingestStatus,
        duplicateOf: item.duplicateOf,
        imageCount: item.imageCount,
        videoUrl: item.videoUrl,
        excerpt: item.excerpt,
        body: item.body,
      },
      resources.map(mapResource),
    );
  } catch {
    const fallback = fallbackItems.find((entry) => entry.id === id);
    return fallback ? normalizeFallbackItem(fallback) : null;
  }
}
