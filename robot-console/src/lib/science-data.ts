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
  resources: ScienceResource[],
) {
  return resources.filter((resource) => resource.isPublic);
}

function toSummary(item: ScienceKnowledgeItem): ScienceKnowledgeSummary {
  const normalizedItem = {
    ...item,
    title: cleanKnowledgeName(item.title),
    sourceFile: cleanKnowledgeName(item.sourceFile),
  };
  const resources = normalizeResources(item.resources);
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
  filePath: string;
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
    filePath: resource.filePath,
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
  const normalizedResources = normalizeResources(resources);
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
  const resources = normalizeResources(item.resources);
  return {
    ...normalizedItem,
    resources,
    resourceTypes: Array.from(new Set(resources.map((resource) => resource.type))),
  };
}

export function mergeScienceKnowledgeSummaries(
  packagedItems: ScienceKnowledgeSummary[],
  databaseItems: ScienceKnowledgeSummary[],
): ScienceKnowledgeSummary[] {
  const databaseById = new Map(databaseItems.map((item) => [item.id, item]));
  const packagedIds = new Set(packagedItems.map((item) => item.id));

  return [
    ...packagedItems.map((item) => {
      const databaseItem = databaseById.get(item.id);
      return databaseItem ? mergeScienceKnowledgeRecord(item, databaseItem) : item;
    }),
    ...databaseItems.filter((item) => !packagedIds.has(item.id)),
  ];
}

function scienceResourceKey(resource: ScienceResource) {
  return `${resource.type}:${resource.title.trim().toLocaleLowerCase("zh-CN")}`;
}

function mergeScienceResources(
  packagedResources: ScienceResource[],
  databaseResources: ScienceResource[],
) {
  const packagedByKey = new Map(
    packagedResources.map((resource) => [scienceResourceKey(resource), resource]),
  );
  const databaseKeys = new Set(databaseResources.map(scienceResourceKey));

  return [
    ...databaseResources.map((resource) => {
      const packagedResource = packagedByKey.get(scienceResourceKey(resource));
      if (!packagedResource) return resource;

      return {
        ...packagedResource,
        ...resource,
        publicPath: resource.publicPath || packagedResource.publicPath,
        externalUrl: resource.externalUrl || packagedResource.externalUrl,
      };
    }),
    ...packagedResources.filter((resource) => !databaseKeys.has(scienceResourceKey(resource))),
  ];
}

function mergeScienceKnowledgeRecord<T extends ScienceKnowledgeSummary>(
  packagedItem: T,
  databaseItem: T,
): T {
  const resources = mergeScienceResources(packagedItem.resources, databaseItem.resources);

  return {
    ...packagedItem,
    ...databaseItem,
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
  const packagedSummaries = fallbackItems.map(toSummary);

  try {
    const items = await prisma.scienceKnowledgeItem.findMany({
      orderBy: { sortOrder: "asc" },
    });
    if (!items.length) return packagedSummaries;

    const resources = await prisma.scienceKnowledgeResource.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: "asc" },
    });
    const groups = groupResources(resources.map(mapResource));

    const databaseSummaries = items.map((item) =>
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

    return mergeScienceKnowledgeSummaries(packagedSummaries, databaseSummaries);
  } catch {
    return packagedSummaries;
  }
}

export async function getScienceKnowledgeItem(id: string): Promise<ScienceKnowledgeItem | null> {
  const fallback = fallbackItems.find((entry) => entry.id === id);

  try {
    const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
    if (!item) {
      return fallback ? normalizeFallbackItem(fallback) : null;
    }

    const resources = await prisma.scienceKnowledgeResource.findMany({
      where: { knowledgeBaseId: item.baseId, isPublic: true },
      orderBy: { sortOrder: "asc" },
    });

    const databaseItem = mapItem(
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

    if (!fallback) return databaseItem;

    const packagedItem = normalizeFallbackItem(fallback);
    return {
      ...mergeScienceKnowledgeRecord(packagedItem, databaseItem),
      videoUrl: databaseItem.videoUrl || packagedItem.videoUrl,
    };
  } catch {
    return fallback ? normalizeFallbackItem(fallback) : null;
  }
}
