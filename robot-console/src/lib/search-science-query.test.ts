import { describe, expect, it, vi } from "vitest";
import type { ScienceKnowledgeItem, ScienceKnowledgeSummary } from "./science-types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeChunk: { findMany: vi.fn().mockResolvedValue([]) },
    knowledgeDocument: { findMany: vi.fn().mockResolvedValue([]) },
    mediaAsset: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("./science-data", () => ({
  getScienceKnowledgeItem: vi.fn(),
  getScienceKnowledgeSummaries: vi.fn(),
  searchScienceSummaries: vi.fn(),
}));

import { searchKnowledge } from "./search";
import {
  getScienceKnowledgeItem,
  getScienceKnowledgeSummaries,
  searchScienceSummaries,
} from "./science-data";

function summary(overrides: Partial<ScienceKnowledgeSummary> = {}): ScienceKnowledgeSummary {
  return {
    id: "EXP-small-bubbles",
    baseId: "EXP-small-bubbles",
    semester: "2025学年",
    category: "科学实验",
    title: "自制泡泡液",
    ageLabel: "小班",
    topic: "泡泡",
    author: "国科二幼",
    excerpt: "观察泡泡的形状和变化。",
    tags: ["科学实验", "小班", "泡泡"],
    resourceTypes: ["教案资源", "图片资源", "视频资源"],
    resources: [
      {
        id: "RESOURCE-small-bubbles-video",
        type: "视频资源",
        knowledgeBaseId: "EXP-small-bubbles",
        semester: "2025学年",
        title: "自制泡泡液视频",
        filePath: "",
        publicPath: "",
        externalUrl: "https://example.com/bubbles",
        source: "测试资料",
        isPublic: true,
      },
    ],
    ...overrides,
  };
}

function item(summaryValue: ScienceKnowledgeSummary): ScienceKnowledgeItem {
  return {
    ...summaryValue,
    sourceFile: "科学实验/泡泡/小班/自制泡泡液.docx",
    sourcePage: "",
    allocationBasis: "",
    ingestStatus: "READY",
    duplicateOf: "",
    imageCount: 0,
    videoUrl: "https://example.com/bubbles",
    body: "一、活动目标\n观察泡泡的形状和变化。\n二、活动准备\n泡泡液和吸管。\n三、活动过程\n幼儿吹泡泡、观察并交流。",
  };
}

describe("science resource retrieval for agent queries", () => {
  it("returns only the requested age/category and includes full item context", async () => {
    const matching = summary();
    vi.mocked(getScienceKnowledgeSummaries).mockResolvedValue([matching]);
    vi.mocked(searchScienceSummaries).mockReturnValue([matching]);
    vi.mocked(getScienceKnowledgeItem).mockResolvedValue(item(matching));

    const result = await searchKnowledge("推荐一个小班科学实验");

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]).toMatchObject({
      documentId: "EXP-small-bubbles",
      title: "自制泡泡液",
    });
    expect(result.chunks[0]?.content).toContain("[LAB:EXP-small-bubbles]");
    expect(result.chunks[0]?.content).toContain("幼儿吹泡泡、观察并交流");
    expect(result.chunks[0]?.content).toContain("RESOURCE-small-bubbles-video");
    expect(result.chunks[0]?.content).toContain("小班");
  });
});
