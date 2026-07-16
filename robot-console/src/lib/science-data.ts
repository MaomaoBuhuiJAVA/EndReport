import fallbackPayload from "@/data/science-knowledge.json";
import { prisma } from "@/lib/prisma";
import type {
  ScienceKnowledgeItem,
  ScienceKnowledgeSummary,
  ScienceResource,
} from "@/lib/science-types";

const fallbackItems = fallbackPayload as unknown as ScienceKnowledgeItem[];

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
  const resources = normalizeResources(item, item.resources);
  return {
    id: item.id,
    baseId: item.baseId,
    semester: item.semester,
    category: item.category,
    title: item.title,
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
    title: resource.title,
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
  const normalizedResources = normalizeResources(item, resources);
  return {
    ...item,
    category: item.category as ScienceKnowledgeItem["category"],
    resources: normalizedResources,
    resourceTypes: Array.from(new Set(normalizedResources.map((resource) => resource.type))),
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
    if (!item) return fallbackItems.find((entry) => entry.id === id) ?? null;

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
    return fallbackItems.find((entry) => entry.id === id) ?? null;
  }
}
