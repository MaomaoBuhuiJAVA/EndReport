import { describe, expect, it } from "vitest";
import { mergeScienceKnowledgeSummaries } from "./science-data";
import type { ScienceKnowledgeSummary, ScienceResource } from "./science-types";

function summary(id: string, title = id): ScienceKnowledgeSummary {
  return {
    id,
    baseId: id,
    semester: "2025学年",
    category: "科学诗",
    title,
    ageLabel: "小班",
    topic: "磁力",
    author: "国科二幼",
    excerpt: "摘要",
    tags: [],
    resourceTypes: [],
    resources: [],
  };
}

function resource(
  type: ScienceResource["type"],
  title: string,
  overrides: Partial<ScienceResource> = {},
): ScienceResource {
  return {
    id: `${type}-${title}`,
    type,
    knowledgeBaseId: "EXP-shared",
    semester: "2025学年",
    title,
    filePath: "",
    publicPath: "",
    externalUrl: "",
    source: "测试资源",
    isPublic: true,
    ...overrides,
  };
}

describe("mergeScienceKnowledgeSummaries", () => {
  it("keeps packaged IDs available while preserving database-only entries", () => {
    const packaged = [summary("POEM-new", "新目录资料"), summary("POEM-shared", "目录版本")];
    const database = [summary("POEM-shared", "数据库版本"), summary("legacy-1", "历史资料")];

    expect(mergeScienceKnowledgeSummaries(packaged, database)).toEqual([
      summary("POEM-new", "新目录资料"),
      summary("POEM-shared", "数据库版本"),
      summary("legacy-1", "历史资料"),
    ]);
  });

  it("fills a legacy database record with a packaged video resource", () => {
    const video = resource("视频资源", "视频二维码", {
      publicPath: "/science-assets/video-qr/example.png",
      externalUrl: "https://example.test/video",
    });
    const image = resource("图片资源", "图片 1", {
      publicPath: "/science-assets/experiments/example.png",
    });
    const packaged = [{ ...summary("EXP-shared", "打包实验"), resources: [video], resourceTypes: ["视频资源" as const] }];
    const database = [{ ...summary("EXP-shared", "数据库实验"), resources: [image], resourceTypes: ["图片资源" as const] }];

    expect(mergeScienceKnowledgeSummaries(packaged, database)).toEqual([
      {
        ...database[0],
        resources: [image, video],
        resourceTypes: ["图片资源", "视频资源"],
      },
    ]);
  });

  it("keeps a corrected story topic when an older database record still has the source-folder topic", () => {
    const title = "会变色的小水滴";
    const packaged = [
      {
        ...summary("STORY-water", title),
        category: "科学故事" as const,
        topic: "水科学与气象自然",
        tags: ["科学故事", "水科学与气象自然", "中班"],
      },
    ];
    const database = [
      {
        ...summary("STORY-water", title),
        category: "科学故事" as const,
        topic: "动物生活习性认知",
        tags: ["科学故事", "动物生活习性认知", "中班"],
      },
    ];

    expect(mergeScienceKnowledgeSummaries(packaged, database)).toMatchObject([
      {
        title,
        topic: "水科学与气象自然",
        tags: ["科学故事", "水科学与气象自然", "中班"],
      },
    ]);
  });
});
