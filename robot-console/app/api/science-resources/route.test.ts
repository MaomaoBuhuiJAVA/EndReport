import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    scienceKnowledgeItem: { findUnique: vi.fn() },
    scienceKnowledgeResource: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/science-data", () => ({
  getScienceKnowledgeItem: vi.fn(),
  getScienceKnowledgeSummaries: vi.fn(),
  searchScienceSummaries: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { PATCH, POST } from "./route";

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/science-resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("science resource creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a science poem with its public cover as a catalogue resource", async () => {
    const tx = {
      scienceKnowledgeItem: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          sourcePage: "",
          allocationBasis: "用户提交",
          ingestStatus: "用户提交",
          duplicateOf: "",
        })),
      },
      scienceKnowledgeResource: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    const response = await POST(jsonRequest({
      category: "科学诗",
      title: "风的旅行",
      ageLabel: "中班",
      topic: "风和空气",
      author: "小朋友",
      body: "风儿轻轻吹，叶子跳起舞。",
      coverUrl: "https://example.com/cover.webp",
      documentUrl: "https://example.com/wind.docx",
      documentName: "风的旅行.docx",
      supportingUrl: "https://example.com/wind-notes.pdf",
      supportingName: "教学提示.pdf",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      item: {
        category: "科学诗",
        title: "风的旅行",
        coverUrl: "https://example.com/cover.webp",
      },
    });
    expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({ resourceType: "图片资源", title: "风的旅行 · 封面" })]),
    }));
    expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ resourceType: "文档资源", title: "风的旅行 · 风的旅行.docx" }),
        expect.objectContaining({ resourceType: "文档资源", title: "风的旅行 · 教学提示.pdf" }),
      ]),
    }));
  });

  it("rejects a science story without a video before writing", async () => {
    const response = await POST(jsonRequest({
      category: "科学故事",
      title: "小水滴旅行记",
      ageLabel: "大班",
      topic: "水循环",
      body: "故事文本",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "科学故事需要提供视频地址或上传视频" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a science story with both its uploaded video and first-frame cover resources", async () => {
    const tx = {
      scienceKnowledgeItem: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          sourcePage: "",
          allocationBasis: "用户提交",
          ingestStatus: "用户提交",
          duplicateOf: "",
        })),
      },
      scienceKnowledgeResource: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    const response = await POST(jsonRequest({
      category: "科学故事",
      title: "小水滴旅行记",
      ageLabel: "大班",
      topic: "水循环",
      author: "小朋友",
      body: "小水滴从云朵出发，开始了水循环的旅行。",
      videoUrl: "https://example.com/water-cycle.mp4",
      coverUrl: "https://example.com/water-cycle-first-frame.webp",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      item: {
        category: "科学故事",
        title: "小水滴旅行记",
        videoUrl: "https://example.com/water-cycle.mp4",
        coverUrl: "https://example.com/water-cycle-first-frame.webp",
      },
    });
    expect(tx.scienceKnowledgeItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ imageCount: 1, videoUrl: "https://example.com/water-cycle.mp4" }),
    }));
    expect(tx.scienceKnowledgeResource.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          resourceType: "图片资源",
          title: "小水滴旅行记 · 封面",
          publicPath: "https://example.com/water-cycle-first-frame.webp",
          externalUrl: "https://example.com/water-cycle-first-frame.webp",
        }),
        expect.objectContaining({
          resourceType: "视频资源",
          title: "小水滴旅行记 · 视频",
          externalUrl: "https://example.com/water-cycle.mp4",
        }),
      ]),
    }));
  });

  it("explains when the catalogue database is unavailable", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Error("Error validating datasource: DATABASE_URL is invalid"),
    );

    const response = await POST(jsonRequest({
      category: "科学诗",
      title: "小雨滴",
      ageLabel: "小班",
      topic: "水循环",
      body: "小雨滴，落下来。",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "资料库连接未配置，暂时无法保存。",
      code: "DATABASE_UNAVAILABLE",
    });
  });

  it("allows an unauthenticated visitor to create a science poem", async () => {
    const tx = {
      scienceKnowledgeItem: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          sourcePage: "",
          allocationBasis: "用户提交",
          ingestStatus: "用户提交",
          duplicateOf: "",
        })),
      },
      scienceKnowledgeResource: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    const response = await POST(jsonRequest({
      category: "科学诗",
      title: "匿名投稿",
      ageLabel: "小班",
      topic: "小雨滴",
      body: "小雨滴，落下来。",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      item: { title: "匿名投稿", category: "科学诗" },
    });
  });

  it("does not expose a public cover replacement endpoint", async () => {
    const response = await PATCH();
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "封面同步接口不对外开放" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
