import fallbackPayload from "@/data/science-knowledge.json";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type {
  ScienceKnowledgeItem,
  ScienceKnowledgeSummary,
  ScienceResource,
} from "@/lib/science-types";
import {
  SCIENCE_AGE_GROUPS,
  SCIENCE_CATEGORIES,
  SCIENCE_RESOURCE_TYPES,
} from "@/lib/science-types";

const fallbackItems = fallbackPayload as unknown as ScienceKnowledgeItem[];
const correctedScienceTopics = new Map([
  ["科学故事\u0000会变色的小水滴", "水科学与气象自然"],
]);

const knowledgeVersionSuffix = /\s*(?:[-_—]\s*\d+|[（(]\s*(?:\d+|[一二三四五六七八九十]+|初稿|初版|定稿|最终稿|终稿|修改稿|修订稿|送审稿)\s*[）)])\s*$/i;

const scienceSearchStopWords = new Set([
  "推荐",
  "适合",
  "关于",
  "一首",
  "一个",
  "什么",
  "正文",
  "内容",
  "怎么",
  "如何",
  "说明",
  "介绍",
  "查看",
  "资料",
  "资源",
  "请问",
  "的",
  "和",
  "并",
]);

const scienceResourceQueryAliases: Array<[string, ScienceResource["type"]]> = [
  ["视频", "视频资源"],
  ["二维码", "视频资源"],
  ["图片", "图片资源"],
  ["步骤图", "图片资源"],
  ["教案", "教案资源"],
  ["文档", "文档资源"],
];

function compactScienceSearchText(value: string) {
  return value.replace(/[\s，。！？、；：,.!?;:()[\]{}《》〈〉「」“”‘’"'的]/g, "").toLocaleLowerCase("zh-CN");
}

function scienceQueryTerms(query: string) {
  const normalized = query.replace(/[，。！？、；：,.!?;:()[\]{}《》〈〉「」“”‘’"']/g, " ");
  return normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1 && !scienceSearchStopWords.has(term));
}

function scienceQueryTitle(query: string) {
  return query.match(/[《〈「“"]\s*([^》〉」”"]+?)\s*[》〉」”"]/u)?.[1]?.trim() ?? "";
}

function scienceQueryMatches(value: string, query: string) {
  const compactValue = compactScienceSearchText(value);
  return compactValue.length > 0 && compactScienceSearchText(query).includes(compactValue);
}

/**
 * Ranks catalog summaries without relying on an embedding or rerank provider.
 * Explicit age/category/media constraints are treated as hard filters so a
 * resource from a neighboring age group cannot win on a broad topic match.
 */
export function searchScienceSummaries(
  items: ScienceKnowledgeSummary[],
  query: string,
  limit = 10,
) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const requestedCategory = SCIENCE_CATEGORIES.find((category) => normalizedQuery.includes(category));
  const requestedAge = SCIENCE_AGE_GROUPS.find((age) => normalizedQuery.includes(age));
  const requestedResourceType = scienceResourceQueryAliases.find(([alias]) => normalizedQuery.includes(alias))?.[1]
    ?? SCIENCE_RESOURCE_TYPES.find((type) => normalizedQuery.includes(type));
  const title = scienceQueryTitle(normalizedQuery);
  const titleCompact = compactScienceSearchText(title);
  const terms = scienceQueryTerms(normalizedQuery);
  const explicitTitles = items
    .map((item) => item.title.trim())
    .filter((itemTitle) => itemTitle.length > 1 && scienceQueryMatches(itemTitle, normalizedQuery))
    .sort((left, right) => right.length - left.length);
  const requestedTitle = titleCompact || compactScienceSearchText(explicitTitles[0] ?? "");
  const requestedTopics = Array.from(new Set(
    items
      .map((item) => item.topic.trim())
      .filter((topic) => topic.length > 0 && scienceQueryMatches(topic, normalizedQuery)),
  ));

  return items
    .map((item, index) => {
      if (requestedCategory && item.category !== requestedCategory) return null;
      if (requestedAge && item.ageLabel !== requestedAge) return null;
      if (requestedResourceType && !item.resourceTypes.includes(requestedResourceType)) return null;

      const searchable = compactScienceSearchText(
        [item.title, item.category, item.ageLabel, item.topic, item.author, item.excerpt, ...item.tags].join(" "),
      );
      const itemTitle = compactScienceSearchText(item.title);
      if (requestedTitle && !itemTitle.includes(requestedTitle)) return null;
      if (requestedTopics.length > 0 && !requestedTopics.includes(item.topic.trim())) return null;
      let score = 0;

      if (requestedTitle && itemTitle === requestedTitle) score += 2000;
      else if (requestedTitle && itemTitle.includes(requestedTitle)) score += 1200;
      if (requestedCategory) score += 280;
      if (requestedAge) score += 240;
      if (requestedResourceType) score += 180;
      if (item.topic && compactScienceSearchText(normalizedQuery).includes(compactScienceSearchText(item.topic))) {
        score += 260;
      }

      for (const term of terms) {
        const compactTerm = compactScienceSearchText(term);
        if (compactTerm && searchable.includes(compactTerm)) score += Math.min(compactTerm.length * 12, 120);
      }

      return { item, score, index };
    })
    .filter(
      (candidate): candidate is { item: ScienceKnowledgeSummary; score: number; index: number } =>
        candidate !== null && candidate.score > 0,
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(({ item }) => item);
}

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

function applyScienceTopicCorrection<T extends ScienceKnowledgeSummary>(item: T): T {
  const topic = correctedScienceTopics.get(`${item.category}\u0000${item.title}`);
  if (!topic || topic === item.topic) return item;

  return {
    ...item,
    topic,
    tags: item.tags.map((tag) => (tag === item.topic ? topic : tag)),
  };
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
  return applyScienceTopicCorrection({
    ...normalizedItem,
    resources,
    resourceTypes: Array.from(new Set(resources.map((resource) => resource.type))),
  });
}

function packagedExperimentKey(item: ScienceKnowledgeSummary) {
  if (item.category !== "科学实验") return "";
  return `${item.category}\u0000${item.ageLabel}\u0000${item.title.trim().toLocaleLowerCase("zh-CN")}`;
}

export function mergeScienceKnowledgeSummaries(
  packagedItems: ScienceKnowledgeSummary[],
  databaseItems: ScienceKnowledgeSummary[],
): ScienceKnowledgeSummary[] {
  const databaseById = new Map(databaseItems.map((item) => [item.id, item]));
  const packagedIds = new Set(packagedItems.map((item) => item.id));
  const packagedExperimentKeys = new Set(
    packagedItems.map(packagedExperimentKey).filter(Boolean),
  );

  return [
    ...packagedItems.map((item) => {
      const databaseItem = databaseById.get(item.id);
      return databaseItem ? mergeScienceKnowledgeRecord(item, databaseItem) : item;
    }),
    ...databaseItems.filter(
      (item) =>
        !packagedIds.has(item.id) && !packagedExperimentKeys.has(packagedExperimentKey(item)),
    ),
  ].map(applyScienceTopicCorrection);
}

function scienceResourceKey(resource: ScienceResource) {
  return `${resource.type}:${resource.title.trim().toLocaleLowerCase("zh-CN")}`;
}

function mergeScienceResources(
  packagedResources: ScienceResource[],
  databaseResources: ScienceResource[],
  preferPackagedExperimentMedia = false,
) {
  const effectiveDatabaseResources = preferPackagedExperimentMedia
    ? databaseResources.filter(
        (resource) => resource.type !== "图片资源" && resource.type !== "视频资源",
      )
    : databaseResources;
  const packagedByKey = new Map(
    packagedResources.map((resource) => [scienceResourceKey(resource), resource]),
  );
  const databaseKeys = new Set(effectiveDatabaseResources.map(scienceResourceKey));

  return [
    ...effectiveDatabaseResources.map((resource) => {
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
  const resources = mergeScienceResources(
    packagedItem.resources,
    databaseItem.resources,
    packagedItem.category === "科学实验",
  );

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

const SCIENCE_DATA_CACHE_SECONDS = 60;
const SCIENCE_DATA_CACHE_TAG = "science-knowledge";

/**
 * The lab page is dynamic because it reads the database, but the catalogue
 * changes much less often than it is viewed. Next's Data Cache avoids a new
 * pair of Prisma queries for every page request while retaining a short TTL
 * for newly imported materials.
 */
const getCachedDatabaseSummaries = unstable_cache(
  async () => {
    const items = await prisma.scienceKnowledgeItem.findMany({
      orderBy: { sortOrder: "asc" },
    });
    if (!items.length) return [];

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
  },
  ["science-knowledge-summaries-v1"],
  { revalidate: SCIENCE_DATA_CACHE_SECONDS, tags: [SCIENCE_DATA_CACHE_TAG] },
);

const getCachedDatabaseItem = unstable_cache(
  async (id: string): Promise<ScienceKnowledgeItem | null> => {
    const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
    if (!item) return null;

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
  },
  ["science-knowledge-item-v1"],
  { revalidate: SCIENCE_DATA_CACHE_SECONDS, tags: [SCIENCE_DATA_CACHE_TAG] },
);

export async function getScienceKnowledgeSummaries(): Promise<ScienceKnowledgeSummary[]> {
  const packagedSummaries = fallbackItems.map(toSummary);

  try {
    const databaseSummaries = await getCachedDatabaseSummaries();
    if (!databaseSummaries.length) return packagedSummaries;

    return mergeScienceKnowledgeSummaries(packagedSummaries, databaseSummaries);
  } catch {
    return packagedSummaries;
  }
}

export async function getScienceKnowledgeItem(id: string): Promise<ScienceKnowledgeItem | null> {
  const fallback = fallbackItems.find((entry) => entry.id === id);

  try {
    const databaseItem = await getCachedDatabaseItem(id);
    if (!databaseItem) {
      return fallback ? normalizeFallbackItem(fallback) : null;
    }

    if (!fallback) return applyScienceTopicCorrection(databaseItem);

    const packagedItem = normalizeFallbackItem(fallback);
    return applyScienceTopicCorrection({
      ...mergeScienceKnowledgeRecord(packagedItem, databaseItem),
      videoUrl: databaseItem.videoUrl || packagedItem.videoUrl,
    });
  } catch {
    return fallback ? normalizeFallbackItem(fallback) : null;
  }
}
