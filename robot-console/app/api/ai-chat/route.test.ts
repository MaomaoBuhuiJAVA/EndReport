import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search", () => ({
  searchKnowledge: vi.fn(),
  wantsPhotoResults: vi.fn(),
}));
vi.mock("@/lib/deepseek", () => ({
  generateDeepSeekReply: vi.fn(),
}));

import { POST } from "./route";
import { generateDeepSeekReply } from "@/lib/deepseek";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

const chunk = (title: string, content: string) => ({
  document: { title },
  content,
});

describe("POST /api/ai-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("多条资料命中仍调用 DeepSeek 并返回资料来源", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("园所简介", "省二级"), chunk("课程", "体验学习")],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("这是自然的园所介绍。");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "介绍园所" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "这是自然的园所介绍。",
      provider: "deepseek",
      sources: ["园所简介", "课程"],
      labLinks: [],
    });
    expect(generateDeepSeekReply).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining("园所简介"),
        message: "介绍园所",
      }),
    );
  });

  it("照片检索保留全部照片和来源，同时调用 DeepSeek", async () => {
    const photos = [
      { id: "1", title: "阅读角", url: "/reading.jpg" },
      { id: "2", title: "科学馆", url: "/science.jpg" },
      { id: "3", title: "大厅", url: "/hall.jpg" },
    ];
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("空间", "功能室")],
      photos,
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(true);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("下方有相关照片。");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "看看照片" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "下方有相关照片。",
      provider: "deepseek",
      photos,
      sources: ["空间"],
      labLinks: [],
    });
  });

  it("返回命中的科小贝资料 ID，供对话中的详情入口直接打开", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-air-car",
          documentId: "air-car",
          title: "空气动力小汽车",
          document: { title: "科小贝实验室：空气动力小汽车" },
          content: "用气球驱动小车的科学实验。",
        },
        chunk("园所简介", "省二级"),
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("可以查看空气动力小汽车的实验详情。");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "推荐一个小班科学实验" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      labLinks: [{ id: "air-car", title: "空气动力小汽车", href: "/lab?item=air-car" }],
    });
  });

  it("模型无可用回复时返回资料库兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("园所简介", "省二级幼儿园")],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "园所级别" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "fallback",
      sources: ["园所简介"],
      labLinks: [],
    });
  });

  it("为打包实验室资料返回确定性的详情链接", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-exp-1",
          documentId: "exp-1",
          title: "水会跳舞",
          document: { title: "科小贝实验室：水会跳舞" },
          content: "水滴实验",
        },
        {
          id: "doc-school",
          documentId: "school",
          title: "园所概览",
          document: { title: "园所概览" },
          content: "园所资料",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("可以试试这个实验。");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "推荐一个水实验" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      labLinks: [{ id: "exp-1", title: "水会跳舞", href: "/lab?item=exp-1" }],
    });
  });
});
