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

// The source folders use the canonical topic "磁力", while teachers often
// search with the classroom wording "磁铁". Keep this small synonym map at
// the catalog boundary so both the laboratory and the chat retrieval use the
// same matching rule.
const scienceTopicQueryAliases: Record<string, readonly string[]> = {
  磁力: ["磁铁", "磁性", "磁极", "吸铁", "吸附铁", "铁钉"],
};

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

function scienceTopicMatchesQuery(topic: string, query: string) {
  if (scienceQueryMatches(topic, query)) return true;
  const compactQuery = compactScienceSearchText(query);
  return (scienceTopicQueryAliases[topic] ?? []).some((alias) =>
    compactQuery.includes(compactScienceSearchText(alias)),
  );
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
      .filter((topic) => topic.length > 0 && scienceTopicMatchesQuery(topic, normalizedQuery)),
  ));
  for (const topic of requestedTopics) terms.push(topic);

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

function scienceCoverUrl(resources: ScienceResource[], category: string) {
  if (category !== "科学诗" && category !== "科学故事") return "";

  const cover = resources.find(
    (resource) =>
      resource.type === "图片资源" &&
      /(?:封面|cover)/iu.test(resource.title) &&
      Boolean(resource.externalUrl || resource.publicPath),
  );
  return cover?.externalUrl || cover?.publicPath || "";
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

const staleStoryAvailability = /视频原文件已按本地资料目录归档；公开播放地址接入后可直接替换此资源链接。/gu;

function applyScienceContentCorrection<T extends ScienceKnowledgeSummary>(item: T): T {
  const corrected = applyScienceTopicCorrection(item);
  let excerpt = corrected.excerpt;
  let body = "body" in corrected && typeof corrected.body === "string" ? corrected.body : "";
  if (corrected.category === "科学故事" && corrected.videoUrl) {
    const availability = "本故事视频已接入在线播放，可在资源详情中直接观看。";
    excerpt = excerpt.replace(staleStoryAvailability, availability);
    body = body.replace(staleStoryAvailability, availability);
  }
  if (corrected.title === "火焰掌" || corrected.title === "神奇的热气球") {
    const warning = "安全警示：涉及易燃气体或明火，仅限成人教师在合规场所演示，幼儿不得操作、触碰或靠近点火区域；不具备安全条件时请改用视频观察。";
    if (!excerpt.includes("安全警示")) excerpt = `${warning}\n${excerpt}`;
    if (body && !body.includes("安全警示")) body = `${warning}\n\n${body}`;
  }
  if (corrected.title === "盐水发电风扇") {
    const principle = "科学原理：镁片和碳片是两种不同电极，盐水充当电解质；电极发生电化学反应并形成闭合回路后产生电流，驱动小风扇。盐水帮助离子传导，但不是电能本身的来源。";
    excerpt = excerpt.replace(/盐水可以产生电能，让风扇转动/gu, "不同电极与盐水电解质形成电化学电池，让风扇转动");
    if (body && !body.includes("科学原理：镁片和碳片")) body = `${principle}\n\n${body}`;
  }
  if (corrected.title === "神奇泡泡实验") {
    excerpt = excerpt.replace(/吸管[^。]*轻轻吸[^。]*液体/gu, "使用安全吹泡工具，禁止把液体吸入口中");
    body = body.replace(/拿吸管伸进混合好的红色洗洁精液体中，轻轻吸一点液体。/u, "使用不会回吸液体的吹泡工具，禁止把液体吸入口中。");
  }
  return {
    ...corrected,
    excerpt,
    ...(body ? { body } : {}),
  } as T;
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
    videoUrl: item.videoUrl,
    ...(scienceCoverUrl(resources, item.category)
      ? { coverUrl: scienceCoverUrl(resources, item.category) }
      : {}),
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
    ...(scienceCoverUrl(normalizedResources, item.category)
      ? { coverUrl: scienceCoverUrl(normalizedResources, item.category) }
      : {}),
  };
}

function normalizeFallbackItem(item: ScienceKnowledgeItem) {
  const normalizedItem = {
    ...item,
    title: cleanKnowledgeName(item.title),
    sourceFile: cleanKnowledgeName(item.sourceFile),
  };
  const resources = normalizeResources(item.resources);
  return applyScienceContentCorrection({
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
  ].map(applyScienceContentCorrection);
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
    // Older database rows predate persisted literature covers. Keep the
    // packaged cover while the database is being refreshed instead of
    // replacing it with an empty value during the merge.
    ...(databaseItem.coverUrl || packagedItem.coverUrl
      ? { coverUrl: databaseItem.coverUrl || packagedItem.coverUrl }
      : {}),
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

/** Cache the catalogue between dynamic page requests without adding Redis. */
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
  ["science-knowledge-summaries-v2"],
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
  ["science-knowledge-item-v2"],
  { revalidate: SCIENCE_DATA_CACHE_SECONDS, tags: [SCIENCE_DATA_CACHE_TAG] },
);

export async function getScienceKnowledgeSummaries(): Promise<ScienceKnowledgeSummary[]> {
  const packagedSummaries = fallbackItems.map((item) => applyScienceContentCorrection(toSummary(item)));

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

    if (!fallback) return applyScienceContentCorrection(databaseItem);

    const packagedItem = normalizeFallbackItem(fallback);
    return applyScienceContentCorrection({
      ...mergeScienceKnowledgeRecord(packagedItem, databaseItem),
      videoUrl: databaseItem.videoUrl || packagedItem.videoUrl,
    });
  } catch {
    return fallback ? normalizeFallbackItem(fallback) : null;
  }
}
