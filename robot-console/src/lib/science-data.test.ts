import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scienceKnowledgeItem: {
      findMany: vi.fn(),
    },
  },
}));

import { getScienceKnowledgeSummaries, mergeScienceKnowledgeSummaries } from "./science-data";
import { searchScienceSummaries } from "./science-data";
import { prisma } from "./prisma";
import type { ScienceKnowledgeSummary, ScienceResource } from "./science-types";
import sciencePayload from "@/data/science-knowledge.json";

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

  it("does not append a stale experiment record when the packaged experiment was re-imported with a new ID", () => {
    const packaged = [
      {
        ...summary("EXP-current", "玩转纸片"),
        category: "科学实验" as const,
        ageLabel: "大班",
        topic: "力与物理运动",
      },
    ];
    const database = [
      {
        ...summary("EXP-legacy", "玩转纸片"),
        category: "科学实验" as const,
        ageLabel: "大班",
        topic: "力与物理运动",
      },
    ];

    expect(mergeScienceKnowledgeSummaries(packaged, database)).toEqual(packaged);
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

  it("uses packaged experiment media when database resources still use obsolete image names", () => {
    const oldImage = resource("图片资源", "纸片 · 图片 1", {
      publicPath: "/science-assets/experiments/old.png",
    });
    const oldVideo = resource("视频资源", "纸片 视频", {
      publicPath: "/science-assets/video-qr/old.png",
      externalUrl: "https://example.test/old-video",
    });
    const lesson = resource("教案资源", "纸片 · 实验教案");
    const material = resource("图片资源", "纸片 · 材料准备 1", {
      publicPath: "/science-assets/experiments/material.png",
    });
    const operation = resource("图片资源", "纸片 · 操作步骤 1", {
      publicPath: "/science-assets/experiments/step.png",
    });
    const video = resource("视频资源", "纸片 视频", {
      publicPath: "/science-assets/video-qr/source.png",
      externalUrl: "https://example.test/source-video",
    });
    const packaged = [
      {
        ...summary("EXP-shared", "纸片"),
        category: "科学实验" as const,
        resources: [lesson, material, operation, video],
        resourceTypes: ["教案资源" as const, "图片资源" as const, "视频资源" as const],
      },
    ];
    const database = [
      {
        ...summary("EXP-shared", "纸片"),
        category: "科学实验" as const,
        resources: [lesson, oldImage, oldVideo],
        resourceTypes: ["教案资源" as const, "图片资源" as const, "视频资源" as const],
      },
    ];

    expect(mergeScienceKnowledgeSummaries(packaged, database)).toMatchObject([
      {
        resources: [lesson, material, operation, video],
        resourceTypes: ["教案资源", "图片资源", "视频资源"],
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

  it("keeps a packaged story cover when the database row predates cover resources", () => {
    const cover = resource("图片资源", "猴子捞月 · 视频首帧封面", {
      externalUrl: "https://cdn.example/story-cover.webp",
      publicPath: "https://cdn.example/story-cover.webp",
    });
    const packaged = [{
      ...summary("STORY-cover", "猴子捞月"),
      category: "科学故事" as const,
      coverUrl: cover.externalUrl,
      resources: [cover],
      resourceTypes: ["图片资源" as const],
    }];
    const database = [{
      ...summary("STORY-cover", "猴子捞月"),
      category: "科学故事" as const,
      resources: [resource("视频资源", "猴子捞月视频", { externalUrl: "https://cdn.example/story.mp4" })],
      resourceTypes: ["视频资源" as const],
    }];

    expect(mergeScienceKnowledgeSummaries(packaged, database)[0]).toMatchObject({
      coverUrl: "https://cdn.example/story-cover.webp",
      resources: expect.arrayContaining([cover]),
    });
  });
});

describe("getScienceKnowledgeSummaries", () => {
  it("keeps the corrected topic when only packaged fallback resources are available", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findMany).mockRejectedValueOnce(new Error("database unavailable"));

    const summaries = await getScienceKnowledgeSummaries();
    const waterStory = summaries.find((item) => item.title === "会变色的小水滴");

    expect(waterStory).toMatchObject({
      category: "科学故事",
      topic: "水科学与气象自然",
      tags: expect.arrayContaining(["水科学与气象自然"]),
    });
  });
});

describe("science catalogue topic matching", () => {
  it("treats 磁铁 as the canonical 磁力 topic and keeps the science-poem filter", () => {
    const matches = searchScienceSummaries(
      sciencePayload as unknown as ScienceKnowledgeSummary[],
      "请查找科学诗里和磁铁有关的内容",
      10,
    );

    expect(matches).toHaveLength(7);
    expect(matches.every((item) => item.category === "科学诗" && item.topic === "磁力")).toBe(true);
    expect(matches.map((item) => item.title)).toEqual(expect.arrayContaining([
      "磁铁的秘密",
      "磁铁小精灵",
      "磁铁小侦探",
    ]));
  });

  it.each(["磁力", "磁铁", "磁性", "磁极", "吸铁", "铁钉"])(
    "maps the classroom term %s to the magnetic science-poem catalogue",
    (term) => {
      const matches = searchScienceSummaries(
        sciencePayload as unknown as ScienceKnowledgeSummary[],
        `查找${term}相关的科学诗`,
        10,
      );

      expect(matches).toHaveLength(7);
      expect(matches.every((item) => item.category === "科学诗" && item.topic === "磁力")).toBe(true);
    },
  );
});
