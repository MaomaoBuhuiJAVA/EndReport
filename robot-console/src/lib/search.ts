import sciencePayload from "@/data/science-knowledge.json";
import { prisma } from "@/lib/prisma";
import type { ScienceKnowledgeItem } from "@/lib/science-types";

const scienceItems = sciencePayload as unknown as ScienceKnowledgeItem[];

const stopWords = new Set(["请问", "一个", "有没有", "什么", "怎么", "可以", "相关", "介绍", "查看", "看看", "是否", "一下", "这个", "那个"]);

const aliases: Record<string, string[]> = {
  园所: ["幼儿园", "国科二幼", "国科温州第二幼儿园", "龙湾区国科温州第二幼儿园", "基本情况", "资质", "省二"],
  概览: ["基本情况", "园所", "资质", "简介", "办园", "园所概览", "结构化资料"],
  资料: ["文档", "档案", "基本情况", "课程", "荣誉", "资料库", "结构化摘要"],
  荣誉: ["获奖", "教师荣誉", "汇总表", "优秀教师", "课题", "赛课"],
  获奖: ["荣誉", "教师荣誉", "汇总表", "优秀教师", "课题", "赛课"],
  教师: ["教职工", "教师荣誉", "名单", "获奖", "老师"],
  老师: ["教师", "教职工", "教师荣誉", "名单", "获奖"],
  功能室: ["绘本", "阅读", "阅读坊", "建构", "积木", "科学", "科学廊", "未来", "大厅", "全景", "空间", "功能室照片", "功能室与空间结构化资料"],
  照片: ["图片", "影像", "成长影像", "成长照片", "功能室", "空间", "园所环境", "活动照片", "照片展示"],
  图片: ["照片", "影像", "成长影像", "成长照片", "功能室", "空间", "园所环境", "照片展示"],
  云宝: ["机器人", "小陪伴", "智能", "监控", "WASD"],
  社团: ["课程", "活动", "合唱", "摄想", "科创"],
  课程: ["体验式学习", "社团", "指南", "纲要", "学习环境", "0-8岁"],
  资质: ["省二", "省二终极", "等级", "创建", "基本情况"],
  科学诗: ["诗歌", "科学童谣", "科学诗库", "自然诗"],
  实验: ["科学实验", "亲子实验", "教师实验", "家庭实验", "实验教案", "实验材料"],
  亲子: ["家长版", "家庭实验", "家园共育", "亲子实验"],
  科小贝: ["科学诗", "科学实验", "实验室", "园本资源"],
};

const knownTerms = [
  "龙湾区国科温州第二幼儿园",
  "国科温州第二幼儿园",
  "国科二幼",
  "园所概览",
  "基本情况",
  "功能室",
  "绘本阅读坊",
  "建构空间坊",
  "未来工作坊",
  "纵深科学廊",
  "园所大厅",
  "园所全景",
  "照片",
  "图片",
  "影像",
  "成长照片",
  "荣誉",
  "获奖",
  "教师荣誉",
  "优秀教师",
  "教职工",
  "教师",
  "老师",
  "社团",
  "课程",
  "指南",
  "纲要",
  "省二",
  "资质",
  "智慧校园",
  "云宝",
  "机器人",
  "科小贝",
  "科学诗",
  "科学实验",
  "亲子实验",
  "教师实验",
  "实验教案",
  "实验材料",
];

export function expandKeywords(query: string) {
  const normalized = query.replace(/[，。！？、；：,.!?;:()[\]{}"'“”‘’]/g, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const compact = normalized.replace(/\s+/g, "");
  const grams = new Set<string>();

  for (const word of words) {
    if (!stopWords.has(word) && word.length > 1) grams.add(word);
  }

  for (let size = 2; size <= 6; size += 1) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      const gram = compact.slice(index, index + size);
      if (!stopWords.has(gram)) grams.add(gram);
    }
  }

  for (const [key, values] of Object.entries(aliases)) {
    if (query.includes(key) || values.some((value) => query.includes(value))) {
      grams.add(key);
      values.forEach((value) => grams.add(value));
    }
  }

  for (const known of knownTerms) {
    if (query.includes(known)) grams.add(known);
  }

  return Array.from(grams).slice(0, 48);
}

function scoreText(text: string, keywords: string[]) {
  let score = 0;
  const haystack = text.toLowerCase();

  for (const keyword of keywords) {
    const word = keyword.toLowerCase();
    const first = haystack.indexOf(word);
    if (first >= 0) {
      score += word.length * (first < 120 ? 4 : 1);
      if (text.includes(keyword)) score += 2;
    }
  }

  return score;
}

function intentBoost(query: string, text: string) {
  let score = 0;
  if (/概览|简介|基本|园所|幼儿园|资质|省二/.test(query) && /园所概览|基本情况|资质|省二|结构化/.test(text)) score += 80;
  if (/功能室|空间|照片|图片|环境|参观|绘本|阅读|建构|积木|科学|未来/.test(query) && /功能室|空间|照片|绘本|建构|科学|未来|大厅|全景/.test(text)) score += 90;
  if (/获奖|荣誉|老师|教师|赛课|课题|汇总/.test(query) && /获奖|荣誉|教师|汇总|课题|赛课|结构化/.test(text)) score += 90;
  if (/课程|社团|指南|纲要|环境创设|学习/.test(query) && /课程|社团|指南|纲要|学习环境|体验式/.test(text)) score += 80;
  if (/云宝|机器人|监控|wasd|控制|日志/.test(query) && /云宝|机器人|WASD|监控|日志/.test(text)) score += 80;
  if (/科小贝|科学诗|诗歌|童谣/.test(query) && /科学诗|诗歌|童谣|自然/.test(text)) score += 110;
  if (/实验|亲子|材料|步骤|玩法|教案/.test(query) && /实验|家长版|教师版|材料|步骤|玩法|教案/.test(text)) score += 110;
  return score;
}

function searchPackagedScience(query: string, keywords: string[]) {
  const candidates = scienceItems
    .map((item) => {
      const text = [item.title, item.category, item.author, item.topic, item.excerpt, item.body, ...item.tags].join(" ");
      return {
        item,
        score: scoreText(text, keywords) + intentBoost(query, text),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const chunks = candidates.map(({ item, score }) => ({
    id: `science-${item.id}`,
    documentId: item.id,
    title: item.title,
    content: `${item.excerpt}
${item.body.slice(0, 1800)}`,
    keywords: item.tags.join(" "),
    createdAt: new Date(0),
    document: {
      title: `科小贝实验室：${item.title}`,
      category: "COURSE" as const,
      summary: item.excerpt,
    },
    score,
  }));

  const photos = candidates
    .flatMap(({ item, score }) =>
      item.resources
        .filter(
          (resource) =>
            resource.type === "图片资源" &&
            resource.isPublic &&
            Boolean(resource.publicPath),
        )
        .map((resource) => ({
          id: resource.id,
          title: resource.title,
          description: `${item.semester} · ${item.title}`,
          url: resource.publicPath,
          kind: "DOCUMENT" as const,
          score,
        })),
    )
    .filter((photo, index, list) => list.findIndex((item) => item.id === photo.id) === index)
    .slice(0, 10);

  return { chunks, photos };
}

export function wantsPhotoResults(query: string) {
  return /照片|图片|影像|图|看看|看一看|参观|环境|空间|功能室|有没有/.test(query);
}

export async function searchKnowledge(query: string) {
  const keywords = expandKeywords(query);

  if (!keywords.length) {
    return { chunks: [], photos: [] };
  }

  const science = searchPackagedScience(query, keywords);

  try {
    const documentWhere = {
      OR: keywords.flatMap((word) => [
        { title: { contains: word, mode: "insensitive" as const } },
        { summary: { contains: word, mode: "insensitive" as const } },
        { content: { contains: word, mode: "insensitive" as const } },
      ]),
    };

    const [chunkCandidates, documentCandidates, photoCandidates, fallbackPhotos] = await Promise.all([
      prisma.knowledgeChunk.findMany({
        where: {
          OR: keywords.flatMap((word) => [
            { title: { contains: word, mode: "insensitive" as const } },
            { content: { contains: word, mode: "insensitive" as const } },
            { keywords: { contains: word, mode: "insensitive" as const } },
            { document: { title: { contains: word, mode: "insensitive" as const } } },
            { document: { summary: { contains: word, mode: "insensitive" as const } } },
          ]),
        },
        include: { document: { select: { title: true, category: true, summary: true } } },
        take: 60,
      }),
      prisma.knowledgeDocument.findMany({
        where: documentWhere,
        select: { id: true, title: true, category: true, summary: true, content: true },
        take: 18,
      }),
      prisma.mediaAsset.findMany({
        where: {
          OR: keywords.flatMap((word) => [
            { title: { contains: word, mode: "insensitive" as const } },
            { description: { contains: word, mode: "insensitive" as const } },
            { room: { name: { contains: word, mode: "insensitive" as const } } },
            { room: { summary: { contains: word, mode: "insensitive" as const } } },
            { room: { description: { contains: word, mode: "insensitive" as const } } },
          ]),
        },
        select: { id: true, title: true, description: true, url: true, kind: true },
        take: wantsPhotoResults(query) ? 30 : 12,
      }),
      wantsPhotoResults(query)
        ? prisma.mediaAsset.findMany({
            where: /功能室|空间|环境|参观|绘本|阅读|建构|积木|科学|未来|大厅|全景/.test(query) ? { kind: "ROOM" } : { kind: { in: ["ROOM", "CAMPUS"] } },
            select: { id: true, title: true, description: true, url: true, kind: true },
            orderBy: { createdAt: "asc" },
            take: 18,
          })
        : Promise.resolve([]),
    ]);

    const documentChunks = documentCandidates.map((document) => ({
      id: `doc-${document.id}`,
      documentId: document.id,
      title: document.title,
      content: `${document.summary}\n${document.content.slice(0, 1400)}`,
      keywords: document.title,
      createdAt: new Date(),
      document: { title: document.title, category: document.category, summary: document.summary },
    }));

    const chunks = [...chunkCandidates, ...documentChunks, ...science.chunks]
      .map((chunk) => ({
        ...chunk,
        score: scoreText(`${chunk.title} ${chunk.content} ${chunk.document.title} ${chunk.document.summary}`, keywords) + intentBoost(query, `${chunk.title} ${chunk.content} ${chunk.document.title} ${chunk.document.summary}`),
      }))
      .filter((chunk) => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const photos = [...photoCandidates, ...fallbackPhotos, ...(wantsPhotoResults(query) ? science.photos : [])]
      .filter((photo, index, list) => list.findIndex((item) => item.id === photo.id) === index)
      .map((photo) => ({
        ...photo,
        score: scoreText(`${photo.title} ${photo.description ?? ""}`, keywords) + intentBoost(query, `${photo.title} ${photo.description ?? ""}`),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return { chunks, photos };
  } catch {
    return {
      chunks: science.chunks,
      photos: wantsPhotoResults(query) ? science.photos : [],
    };
  }
}
