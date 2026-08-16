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

  it("生成指定完整教案时锁定当前资料并补齐活动过程", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-paper",
          documentId: "paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: [
            "一、活动目标",
            "1. 感受纸片在不同操作中的变化。",
            "二、活动准备",
            "彩纸、吸管、剪刀和记录卡。",
            "三、活动玩法",
            "1. 幼儿观察纸片并说出猜想。",
            "2. 尝试折叠、吹动和移动纸片。",
            "3. 分享发现并完成记录。",
            "实验步骤：",
          ].join("\n"),
        },
        {
          id: "science-car",
          documentId: "car",
          title: "空气动力小汽车",
          document: { title: "科小贝实验室：空气动力小汽车" },
          content: "无关实验内容",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("## 一、活动目标\n目标\n## 二、活动准备\n材料");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload).toMatchObject({
      provider: "fallback",
      labLinks: [{ id: "paper", title: "玩转纸片", href: "/lab?item=paper" }],
    });
    expect(payload.reply).toContain("活动过程");
    expect(payload.reply).toContain("幼儿观察纸片并说出猜想");
    expect(payload.reply).not.toContain("实验步骤：");
    expect(generateDeepSeekReply).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.stringContaining("玩转纸片"),
        maxTokens: 1600,
      }),
    );
    expect(vi.mocked(generateDeepSeekReply).mock.calls[0]?.[0]?.context).not.toContain("空气动力小汽车");
  });

  it("模型缺少观察、小结和提示时仍返回完整教案兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-paper",
          documentId: "paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "一、活动目标\n目标\n二、活动准备\n材料\n三、活动过程\n1. 操作纸片。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue([
      "### 一、活动目标",
      "目标",
      "### 二、活动准备",
      "材料",
      "### 三、活动过程",
      "1. 操作纸片。",
    ].join("\n"));

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toContain("观察与表达");
    expect(payload.reply).toContain("小结与延伸");
    expect(payload.reply).toContain("活动提示");
  });

  it("在资料未命中且模型不可用时仍回应基础问候", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDeepSeekReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "你好，科小贝" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "fallback",
      reply: expect.stringContaining("你好"),
    });
  });

  it("普通问候直接进入对话，不检索资料库或附带实验入口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-volcano",
          documentId: "volcano",
          title: "火山喷发",
          document: { title: "科小贝实验室：火山喷发" },
          content: "无关的实验资料",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("你好呀，我在这里。你想聊什么科学主题？");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "你好，科小贝" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "你好呀，我在这里。你想聊什么科学主题？",
      provider: "deepseek",
      photos: [],
      sources: [],
      labLinks: [],
    });
    expect(searchKnowledge).not.toHaveBeenCalled();
    expect(wantsPhotoResults).not.toHaveBeenCalled();
    expect(generateDeepSeekReply).toHaveBeenCalledWith(
      expect.objectContaining({ context: "", message: "你好，科小贝" }),
    );
  });

  it("普通闲聊不检索资料库或附带实验入口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("科小贝实验室：火山喷发", "无关实验资料")],
      photos: [],
    } as never);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("天气很好，适合一起观察自然现象。");

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "今天天气真好" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "deepseek",
      photos: [],
      sources: [],
      labLinks: [],
    });
    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it("模型不可用时天气闲聊仍返回自然的对话兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDeepSeekReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "今天天气真好" }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("fallback");
    expect(payload.reply).toContain("天气");
    expect(payload.reply).not.toContain("暂时没有检索到直接对应的资料");
    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it("介绍自己和随便聊天不会触发资料检索", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("当然可以，我们聊聊科学和生活。");

    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "介绍一下你自己，我们随便聊聊" }),
      }),
    );

    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it("带有明确实验请求的闲聊仍然检索资料库", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-paper",
          documentId: "paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "纸片实验资料",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(generateDeepSeekReply).mockResolvedValue("可以试试玩转纸片。");

    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "今天天气真好，推荐一个实验" }),
      }),
    );

    expect(searchKnowledge).toHaveBeenCalledWith("今天天气真好，推荐一个实验");
  });
});
