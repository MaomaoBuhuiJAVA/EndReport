import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search", () => ({
  searchKnowledge: vi.fn(),
  wantsPhotoResults: vi.fn(),
}));
vi.mock("@/lib/dify", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dify")>("@/lib/dify");
  return {
    ...actual,
    generateDifyReply: vi.fn(),
    openDifyStream: vi.fn(),
    uploadDifyFile: vi.fn(),
  };
});
vi.mock("@/lib/science-cover-sync", () => ({
  synchronizeSciencePoetryCover: vi.fn(),
}));

import { maxDuration, POST } from "./route";
import { generateDifyReply, openDifyStream, uploadDifyFile } from "@/lib/dify";
import { synchronizeSciencePoetryCover } from "@/lib/science-cover-sync";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

const chunk = (title: string, content: string) => ({
  document: { title },
  content,
});
const signedDownloadUrl = () => expect.stringMatching(/^\/api\/ai-chat\/download\?token=[A-Za-z0-9_.-]+$/u);

describe("POST /api/ai-chat", () => {
  const previousDifyApiKey = process.env.DIFY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIFY_API_KEY = "route-test-dify-key";
  });

  afterEach(() => {
    if (previousDifyApiKey === undefined) delete process.env.DIFY_API_KEY;
    else process.env.DIFY_API_KEY = previousDifyApiKey;
  });

  it("给通义图片生成保留足够的服务端执行时间", () => {
    expect(maxDuration).toBeGreaterThanOrEqual(120);
  });

  it("为每条非流式助手回复返回独立的 responseId", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "这是一次可评价的回复。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "给我一个小班科学活动建议" }),
      }),
    );

    const payload = await response.json();
    expect(payload.responseId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("先完成资料检索，明确资源请求无结果时直接返回零匹配", async () => {
    let searchStarted = false;
    let difyStarted = false;
    let releaseSearch!: (value: never) => void;
    let releaseDify!: (value: never) => void;
    const searchPromise = new Promise<never>((resolve) => {
      releaseSearch = resolve;
    });
    const difyPromise = new Promise<never>((resolve) => {
      releaseDify = resolve;
    });

    vi.mocked(searchKnowledge).mockImplementation(() => {
      searchStarted = true;
      return searchPromise as never;
    });
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockImplementation(() => {
      difyStarted = true;
      return difyPromise as never;
    });

    const responsePromise = POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "推荐一个小班科学实验" }),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(searchStarted).toBe(true);
    expect(difyStarted).toBe(false);

    releaseSearch({ chunks: [], photos: [] } as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(difyStarted).toBe(false);
    releaseDify({ answer: "可以试试一个小班科学实验。" } as never);
    const response = await responsePromise;
    await expect(response.json()).resolves.toMatchObject({
      reply: expect.stringContaining("暂时没有匹配的小班科学实验"),
    });
  });

  it("流式请求逐段返回 Dify 回复，并保留实验室详情入口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-air-car",
          documentId: "air-car",
          title: "空气动力小汽车",
          document: { title: "科小贝实验室：空气动力小汽车" },
          content: "用气球驱动小车的科学实验。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          'data: {"event":"message","answer":"可以试试"}',
          '',
          'data: {"event":"message","answer":"空气动力小汽车。"}',
          '',
          'data: {"event":"message_end","conversation_id":"conversation-stream-1"}',
          '',
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "推荐一个小班科学实验", userId: "web-stream-user" }),
      }),
    );

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    expect(events).toEqual([
      {
        type: "meta",
        photos: [],
        sources: ["科小贝实验室：空气动力小汽车"],
        labLinks: [{ id: "air-car", title: "空气动力小汽车", href: "/lab?item=air-car" }],
      },
      { type: "delta", delta: "可以试试" },
      { type: "delta", delta: "空气动力小汽车。" },
      {
        type: "done",
        provider: "dify",
        reply: "可以试试空气动力小汽车。",
        conversationId: "conversation-stream-1",
        responseId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      },
    ]);
  });

  it("明确查找园本科学资料时直接返回本地命中，不等待 Dify", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-POEM-magnet-small",
          documentId: "POEM-magnet-small",
          title: "磁铁的秘密",
          document: { title: "科小贝实验室：磁铁的秘密" },
          content: "[LAB:POEM-magnet-small]\n类别：科学诗\n适用年龄：小班\n主题：磁力\n摘要：磁铁姥姥穿花袄，铁针宝宝蹦蹦跳。",
        },
        {
          id: "science-POEM-magnet-large",
          documentId: "POEM-magnet-large",
          title: "磁铁小精灵",
          document: { title: "科小贝实验室：磁铁小精灵" },
          content: "[LAB:POEM-magnet-large]\n类别：科学诗\n适用年龄：大班\n主题：磁力\n摘要：小磁铁，有魔法。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "帮我查找科学诗里和磁铁有关的内容" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "fallback",
      reply: expect.stringContaining("磁铁的秘密"),
      labLinks: expect.arrayContaining([
        { id: "POEM-magnet-small", title: "磁铁的秘密", href: "/lab?item=POEM-magnet-small" },
      ]),
    });
    expect(generateDifyReply).not.toHaveBeenCalled();
    expect(openDifyStream).not.toHaveBeenCalled();
  });

  it("命中园本科学原理时直接回答解释型问题，不让 Dify 否认已有资料", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-POEM-magnet-principle",
          documentId: "POEM-magnet-principle",
          title: "磁铁小精灵",
          document: { title: "科小贝实验室：磁铁小精灵" },
          content: [
            "[LAB:POEM-magnet-principle]",
            "类别：科学诗",
            "适用年龄：大班",
            "主题：磁力",
            "正文：磁铁小精灵。",
            "科学原理：铁磁材料内部的磁畴在外场中定向排列，所以磁铁能够吸引铁钉。",
          ].join("\n"),
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "磁铁为什么能吸住铁钉？" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "fallback",
      reply: expect.stringContaining("磁铁能够吸引铁钉"),
      labLinks: [{ id: "POEM-magnet-principle", title: "磁铁小精灵", href: "/lab?item=POEM-magnet-principle" }],
    });
    expect(generateDifyReply).not.toHaveBeenCalled();
    expect(openDifyStream).not.toHaveBeenCalled();
  });

  it("流式通道不可用时立即返回本地降级结果而不重复请求 Dify", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "你好" }),
      }),
    );

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    expect(events.at(-1)).toMatchObject({
      type: "done",
      reply: expect.stringContaining("你好，我是科小贝"),
      provider: "fallback",
    });
    expect(generateDifyReply).not.toHaveBeenCalled();
  });

  it("Dify SSE 错误事件不会再被包装成正常 done 回复", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          'data: {"event":"error","message":"上游模型暂时不可用"}',
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "请介绍一下你自己" }),
      }),
    );

    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events).toEqual([
      { type: "meta", photos: [], sources: [], labLinks: [] },
      { type: "error", message: "上游模型暂时不可用" },
    ]);
  });

  it("多条资料命中仍调用 Dify 并返回资料来源", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("园所简介", "省二级"), chunk("课程", "体验学习")],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "这是自然的园所介绍。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "介绍园所" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "这是自然的园所介绍。",
      provider: "dify",
      sources: ["园所简介", "课程"],
      labLinks: [],
    });
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("介绍园所"),
      }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]?.message).toContain("《园所简介》省二级");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("history");
  });

  it("将 Vercel 科学资源检索上下文传给 Dify", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-EXP-bubbles",
        documentId: "EXP-bubbles",
        title: "自制泡泡液",
        document: { title: "科小贝实验室：自制泡泡液" },
        content: "[LAB:EXP-bubbles]\n适用年龄：小班\n正文：幼儿吹泡泡、观察并交流。\n[RESOURCE:video-bubbles] 视频资源：https://example.com/bubbles",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "可以试试自制泡泡液。" });

    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "推荐一个小班科学实验" }),
      }),
    );

    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringContaining("[LAB:EXP-bubbles]"),
    });
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]?.message).toContain("幼儿吹泡泡、观察并交流");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]?.message).toContain("video-bubbles");
  });

  it("照片检索保留全部照片和来源，同时调用 Dify", async () => {
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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "下方有相关照片。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "看看照片" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "下方有相关照片。",
      provider: "dify",
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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "可以查看空气动力小汽车的实验详情。" });

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
    vi.mocked(generateDifyReply).mockResolvedValue(null);

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

  it("资料库兜底会清理正文中的 Markdown 标题，避免聊天气泡排版混乱", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("科小贝实验室：水的蒸发", "## 水的蒸发\n水受热后会逐渐蒸发。")],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "水为什么会蒸发？" }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("fallback");
    expect(payload.reply).toContain("- 《科小贝实验室：水的蒸发》水的蒸发");
    expect(payload.reply).not.toContain("##");
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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "可以试试这个实验。" });

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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "## 一、活动目标\n目标\n## 二、活动准备\n材料" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload).toMatchObject({
      provider: "dify",
      labLinks: [{ id: "paper", title: "玩转纸片", href: "/lab?item=paper" }],
    });
    expect(payload.reply).toContain("目标");
    expect(payload.reply).toContain("活动过程");
    expect(payload.reply).toContain("幼儿观察纸片并说出猜想");
    expect(payload.reply).not.toContain("实验步骤：");
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("生成《玩转纸片》完整教案") }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]?.message).toContain("感受纸片在不同操作中的变化");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("maxTokens");
  });

  it("弹窗主题生成教案时只保留当前主题的资料入口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-EXP-paper",
          documentId: "EXP-paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "一、活动目标\n探索纸片与静电。\n二、活动准备\n纸片、吸管。\n三、活动过程\n幼儿观察纸片。",
        },
        {
          id: "science-STORY-water-drop",
          documentId: "STORY-water-drop",
          title: "会变色的小水滴",
          document: { title: "科小贝实验室：会变色的小水滴" },
          content: "无关的科学故事资料。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "### 活动目标",
        "观察纸片的变化。",
        "### 活动准备",
        "纸片和吸管。",
        "### 活动过程",
        "幼儿动手操作。",
        "",
        "配套资源：[会变色的小水滴](/lab?item=STORY-water-drop)",
      ].join("\n"),
      metadata: {
        agent_result: {
          kind: "work_feedback",
          encouragement: ["继续观察"],
          i_saw: ["完成活动"],
          i_wonder: ["纸片为什么会动"],
          next_try: ["再试一次"],
          tags: ["科学"],
          recommended_resources: [{
            resource_id: "STORY-water-drop",
            title: "会变色的小水滴",
            source: "园本资料库",
          }],
          privacy_visibility: "teacher_only",
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请生成一份完整教案。年龄段：大班；主题：玩转纸片；活动时长：30 分钟；输出格式：Word 文档。请同时导出为 DOCX 文件。",
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.sources).toEqual(["科小贝实验室：玩转纸片"]);
    expect(payload.labLinks).toEqual([
      { id: "EXP-paper", title: "玩转纸片", href: "/lab?item=EXP-paper" },
    ]);
    expect(payload.reply).not.toContain("会变色的小水滴");
    expect(payload.agentResult).toBeUndefined();
  });

  it("表单提示词包含示例表名时仍按主题字段锁定当前实验", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-EXP-paper",
          documentId: "EXP-paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "一、活动目标\n探索纸片。\n二、活动准备\n纸片。\n三、活动过程\n幼儿操作。",
        },
        {
          id: "science-EXP-water-drop",
          documentId: "EXP-water-drop",
          title: "会变色的小水滴",
          document: { title: "科小贝实验室：会变色的小水滴" },
          content: "无关实验。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "已按模板生成玩转纸片教案。",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请按示例“温州市龙湾区国科温州第二幼儿园教育教学活动设计表”生成一份完整教案。主题：《玩转纸片》；班级（适用年龄段）：大班；活动时长：30 分钟；输出格式：Word 文档。",
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.sources).toEqual(["科小贝实验室：玩转纸片"]);
    expect(payload.labLinks).toEqual([
      { id: "EXP-paper", title: "玩转纸片", href: "/lab?item=EXP-paper" },
    ]);
  });

  it("已经符合备课表格字段的教案不再追加另一套板块", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-paper",
        documentId: "paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "一、活动目标\n目标\n二、活动准备\n材料\n三、活动过程\n操作。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "主题：玩转纸片",
        "领域：科学",
        "班级：大班",
        "来源：科小贝智能体",
        "教学活动：玩转纸片",
        "时间：30 分钟",
        "教师：",
        "活动目标：观察纸片变化。",
        "重点难点：比较不同折法。",
        "活动准备：纸片、吸管。",
        "活动内容：先猜想，再操作并交流。",
        "备注：",
        "活动反思：幼儿能够表达发现。",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toContain("| 活动反思 | 幼儿能够表达发现。 |");
    expect(payload.reply).not.toContain("观察与小结");
    expect(payload.reply).not.toContain("延伸与安全提示");
  });

  it("电话模式只返回短答，不把长文本增量刷到通话窗口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockImplementation(async (args) => {
      expect(args.message).toContain("【电话对话模式】");
      expect(args.message).toContain("最多两句");
      expect(args.conversationId).toBeUndefined();
      return new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "这是一段很长的回答，包含很多不适合电话播报的背景说明。请在通话中只保留最重要的操作建议。" })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "call-conversation" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "怎么做一个光影实验？", voiceCall: true, userId: "call-user" }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    expect(events.filter((event) => event.type === "delta")).toEqual([]);
    const done = events.find((event) => event.type === "done");
    expect(done).toBeDefined();
    expect(Array.from(done!.reply).length).toBeLessThanOrEqual(72);
    expect(done!.conversationId).toBeUndefined();
  });

  it("普通教案请求不注入电话提示词，并使用常规长超时", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockImplementation(async (args) => {
      expect(args.message).not.toContain("【电话对话模式】");
      expect(args.timeoutMs).toBeGreaterThan(12_000);
      return new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "活动目标：观察纸片变化。活动准备：纸片。活动过程：先猜想，再操作并交流。" })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "lesson-conversation" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案", userId: "lesson-user" }),
      }),
    );

    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    expect(events.find((event) => event.type === "done")?.reply).toContain("活动过程");
  });

  it("保留 Dify 返回的无表格完整教案，不用通用兜底内容覆盖", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-jujube",
        documentId: "jujube",
        title: "枣子是怎么来的",
        document: { title: "科小贝实验室：枣子是怎么来的" },
        content: "园本主题资料。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "主题：枣子是怎么来的",
        "领域：科学（自然探究）",
        "班级：中班",
        "来源：教师自编",
        "教学活动：综合探究活动",
        "时间：20分钟",
        "教师：",
        "活动目标：",
        "知道枣子长在枣树上，愿意观察并表达自己的猜想。",
        "重点难点：重点是认识枣子的来源；难点是理解开花、结果、成熟的顺序。",
        "活动准备：枣树图片、枣花青枣红枣排序卡、记录纸。",
        "活动内容：",
        "设计意图：从幼儿熟悉的食物经验出发，引导其观察、排序和表达。",
        "（一）导入猜想（约3分钟）",
        "教师行为：出示红枣并提问枣子从哪里来。",
        "幼儿可能回应或表现：有人说树上，有人说地里。",
        "教师回应：肯定不同猜想并出示枣树图片。",
        "（二）分组操作（约8分钟）",
        "教师行为：指导幼儿合作排列枣花、青枣和红枣卡片。",
        "幼儿可能回应或表现：幼儿讨论先后顺序并记录。",
        "教师回应：追问花谢后会发生什么。",
        "（三）分享表达（约6分钟）",
        "教师行为：请各组说明排序依据。",
        "幼儿可能回应或表现：幼儿用语言或动作讲述生长过程。",
        "教师回应：用完整句式梳理共同发现。",
        "（四）总结延伸（约3分钟）",
        "教师行为：回顾枣子从开花到成熟的过程并提出家庭观察任务。",
        "幼儿可能回应或表现：联系生活说出红枣食物。",
        "教师回应：鼓励继续观察并分享。",
        "备注：枣子去核切小后再提供，关注过敏和吞咽安全。",
        "活动反思：记录幼儿是否能按顺序表达并调整分组材料。",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "请生成《枣子是怎么来的》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("dify");
    expect(payload.reply).toContain("枣子长在枣树上");
    expect(payload.reply).toContain("（二）分组操作（约8分钟）");
    expect(payload.reply).not.toContain("请根据资料详情准备相应材料");
    expect(payload.reply).not.toContain("### 备课表字段");
  });

  it("教案分析语义不会被当成完整教案生成", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-paper",
        documentId: "paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "实验资料。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "这是教案分析结果。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "请生成《玩转纸片》教案分析" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toBe("这是教案分析结果。");
  });

  it("完整教案正文会移除无关资源标题和裸实验室链接", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-paper",
        documentId: "paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "一、活动目标\n目标\n二、活动准备\n材料\n三、活动过程\n操作。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "完整教案已生成。\n相关资源：会变色的小水滴 https://www.qyfck.icu/lab?item=water-drop",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).not.toContain("会变色的小水滴");
    expect(payload.reply).not.toContain("/lab?item=water-drop");
  });

  it("不带书名号的教案请求也只保留当前主题资源", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-EXP-paper",
          documentId: "EXP-paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "纸片实验资料。",
        },
        {
          id: "science-EXP-water-drop",
          documentId: "EXP-water-drop",
          title: "会变色的小水滴",
          document: { title: "科小贝实验室：会变色的小水滴" },
          content: "无关实验资料。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "教案已生成。相关资源：会变色的小水滴 https://www.qyfck.icu/lab?item=EXP-water-drop",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成玩转纸片完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.sources).toEqual(["科小贝实验室：玩转纸片"]);
    expect(payload.labLinks).toEqual([
      { id: "EXP-paper", title: "玩转纸片", href: "/lab?item=EXP-paper" },
    ]);
    expect(payload.reply).not.toContain("会变色的小水滴");
  });

  it("Dify 不可用时仍返回包含参考字段的教案正文", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-paper",
        documentId: "paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "一、活动目标\n目标\n二、活动准备\n材料\n三、活动过程\n操作。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toContain("领域");
    expect(payload.reply).toContain("重点难点");
    expect(payload.reply).toContain("活动反思");
  });

  it("从表单生成请求中优先提取主题字段而不是示例模板标题", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-EXP-paper",
          documentId: "EXP-paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "一、活动目标\n探索纸片。\n二、活动准备\n纸片。\n三、活动过程\n幼儿操作纸片。",
        },
        {
          id: "science-STORY-water-drop",
          documentId: "STORY-water-drop",
          title: "会变色的小水滴",
          document: { title: "科小贝实验室：会变色的小水滴" },
          content: "无关资料。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "### 活动目标\n观察纸片。\n### 活动准备\n纸片。\n### 活动过程\n幼儿操作纸片。",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请按示例“温州市龙湾区国科温州第二幼儿园教育教学活动设计表”生成一份完整教案。主题：《玩转纸片》；班级（适用年龄段）：大班；活动时长：30 分钟；输出格式：Word 文档。",
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.sources).toEqual(["科小贝实验室：玩转纸片"]);
    expect(payload.labLinks).toEqual([
      { id: "EXP-paper", title: "玩转纸片", href: "/lab?item=EXP-paper" },
    ]);
  });

  it("把备课表的十三个字段表格视为完整教案，不追加旧版板块", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-EXP-paper",
        documentId: "EXP-paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "资料库内容",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "| 主题 | 领域 | 班级 | 来源 |",
        "| --- | --- | --- | --- |",
        "| 玩转纸片 | 科学 | 大班 | 园本资料库 |",
        "| 教学活动 | 时间 | 教师 | 活动目标 |",
        "| 玩转纸片 | 30分钟 | 待填写 | 观察纸片变化 |",
        "| 重点难点 | 活动准备 | 活动内容 | 备注 |",
        "| 纸片变化 | 纸片、吸管 | 幼儿操作并记录 | 待补充 |",
        "| 活动反思 |  |  |  |",
        "| 活动后填写 |  |  |  |",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toContain("| 字段 | 内容 |");
    expect(payload.reply).toContain("| 来源 | 园本资料库 |");
    expect(payload.reply).not.toContain("### 观察与小结");
    expect(payload.reply).not.toContain("### 活动小结");
    expect(payload.reply).not.toContain("### 延伸与安全提示");
  });

  it("十三个字段都为空时不会把教案骨架当成完整结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-EXP-paper",
        documentId: "EXP-paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "一、活动目标\n观察纸片变化。\n二、活动准备\n纸片、吸管。\n三、活动过程\n1. 幼儿先猜想。\n2. 分组操作并交流。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "主题：",
        "领域：",
        "班级：",
        "来源：",
        "教学活动：",
        "时间：",
        "教师：",
        "活动目标：",
        "重点难点：",
        "活动准备：",
        "活动内容：",
        "备注：",
        "活动反思：",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toContain("重点：观察并表达现象");
    expect(payload.reply).toContain("活动内容");
    expect(payload.provider).toBe("fallback");
  });

  it("教案分析、评估或审阅请求不进入完整教案补全分支", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-EXP-paper",
        documentId: "EXP-paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "资料库内容",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "这是教案分析结果。",
      metadata: {
        agent_result: {
          kind: "degraded",
          code: "invalid_result",
          message: "分析结果需要补充后重试。",
          retry: true,
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请生成一份《玩转纸片》教案分析，评估活动目标、过程并提出修改建议。",
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.agentResult).toMatchObject({ kind: "degraded", code: "invalid_result" });
    expect(payload.reply).toBe("这是教案分析结果。");
  });

  it("教案回复会移除无关资料名称和裸实验详情 URL", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-EXP-paper",
          documentId: "EXP-paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "资料库内容",
        },
        {
          id: "science-STORY-water-drop",
          documentId: "STORY-water-drop",
          title: "会变色的小水滴",
          document: { title: "科小贝实验室：会变色的小水滴" },
          content: "无关资料。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "教案正文。\n配套资源：会变色的小水滴 https://www.qyfck.icu/lab?item=STORY-water-drop",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).not.toContain("会变色的小水滴");
    expect(payload.reply).not.toContain("STORY-water-drop");
  });

  it("Dify 不可用时的教案兜底仍包含备课表全部字段", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-EXP-paper",
        documentId: "EXP-paper",
        title: "玩转纸片",
        document: { title: "科小贝实验室：玩转纸片" },
        content: "一、活动目标\n观察纸片。\n二、活动准备\n纸片。\n三、活动过程\n幼儿操作纸片。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    for (const field of [
      "主题", "领域", "班级", "来源", "教学活动", "时间", "教师", "活动目标",
      "重点难点", "活动准备", "活动内容", "备注", "活动反思",
    ]) {
      expect(payload.reply).toContain(field);
    }
  });

  it("资料库未命中时表单教案请求仍生成完整备课表兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请按示例生成一份完整教案。主题：玩转纸片；班级（适用年龄段）：大班；活动时长：30 分钟；输出格式：Word 文档。",
        }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("fallback");
    expect(payload.reply).toContain("《玩转纸片》完整教案");
    expect(payload.reply).not.toContain("暂时没有检索到直接对应的资料");
    for (const field of [
      "主题", "领域", "班级", "来源", "教学活动", "时间", "教师", "活动目标",
      "重点难点", "活动准备", "活动内容", "备注", "活动反思",
    ]) {
      expect(payload.reply).toContain(field);
    }
  });

  it("教案分析请求不被误判为指定教案生成", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "我会按活动目标、过程与安全性分析这份材料。",
      metadata: {
        agent_result: {
          kind: "degraded",
          code: "invalid_result",
          message: "结构化结果需要补充后重试。",
          retry: true,
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请分析我上传的《完整教案.docx》教案或研修材料，给出结构、目标、过程和可执行的改进建议。",
        }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      agentResult: {
        kind: "degraded",
        code: "invalid_result",
      },
    });
  });

  it("流式指定教案只交付整理后的单一结果和当前主题入口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [
        {
          id: "science-EXP-paper",
          documentId: "EXP-paper",
          title: "玩转纸片",
          document: { title: "科小贝实验室：玩转纸片" },
          content: "一、活动目标\n探索纸片。\n二、活动准备\n纸片和吸管。\n三、活动过程\n幼儿动手操作。",
        },
        {
          id: "science-STORY-water-drop",
          documentId: "STORY-water-drop",
          title: "会变色的小水滴",
          document: { title: "科小贝实验室：会变色的小水滴" },
          content: "无关的科学故事资料。",
        },
      ],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          'data: {"event":"message","answer":"### 活动目标\\n观察纸片。\\n### 活动准备\\n纸片和吸管。\\n### 活动过程\\n幼儿动手操作。"}',
          "",
          'data: {"event":"message","answer":"\\n配套资源：[会变色的小水滴](/lab?item=STORY-water-drop)"}',
          "",
          'data: {"event":"message_end","conversation_id":"lesson-stream-1"}',
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({
          message: "请生成一份完整教案。年龄段：大班；主题：玩转纸片；活动时长：30 分钟；输出格式：Word 文档。",
        }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.map((event) => event.type)).toEqual(["meta", "done"]);
    expect(events[0].labLinks).toEqual([
      { id: "EXP-paper", title: "玩转纸片", href: "/lab?item=EXP-paper" },
    ]);
    expect(events[1].reply).not.toContain("会变色的小水滴");
  });

  it("模型缺少完整过程时保留正文并补齐模板活动阶段", async () => {
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
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "### 一、活动目标",
        "目标",
        "### 二、活动准备",
        "材料",
        "### 三、活动过程",
        "1. 操作纸片。",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("dify");
    expect(payload.reply).toContain("（一）情境导入与猜想");
    expect(payload.reply).toContain("（二）分组操作与记录");
    expect(payload.reply).toContain("（三）分享表达与归纳");
    expect(payload.reply).toContain("（四）总结延伸");
    expect(payload.reply.match(/### 三、活动过程/g)).toHaveLength(1);
  });

  it("教案过程不足时保留模型目标并补齐一套活动阶段", async () => {
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
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "### 活动目标",
        "探索静电现象。",
        "### 活动准备",
        "纸片、吸管和记录卡。",
        "### 活动过程",
        "1. 幼儿动手操作纸片。",
        "### 观察与小结",
        "记录纸片移动的现象。",
        "### 活动小结",
        "分享静电带来的变化。",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.reply).toContain("探索静电现象。");
    expect(payload.reply.match(/### 三、活动过程/g)).toHaveLength(1);
    expect(payload.reply.match(/(?:^|\n)（三）分享表达与归纳/g)).toHaveLength(1);
    expect(payload.reply.match(/(?:^|\n)（四）总结延伸/g)).toHaveLength(1);
  });

  it("保留 Dify 已生成的教案正文，并补齐模板过程", async () => {
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
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "### 活动目标",
        "这是 Dify 生成的目标。",
        "### 活动准备",
        "这是 Dify 生成的材料。",
        "### 活动过程",
        "这是 Dify 生成的过程。",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("dify");
    expect(payload.reply).toContain("这是 Dify 生成的目标");
    expect(payload.reply).toContain("（三）分享表达与归纳");
    expect(payload.reply).toContain("（四）总结延伸");
    expect(payload.reply).toContain("活动后记录幼儿表现");
  });

  it("教案标题齐全但活动过程为空时保留模型并补充可执行步骤", async () => {
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
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "### 一、活动目标",
        "目标",
        "### 二、活动准备",
        "材料",
        "### 三、活动过程",
        "### 四、观察与表达",
        "观察",
        "### 五、小结与延伸",
        "小结",
        "### 六、活动提示",
        "提示",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const payload = await response.json();

    expect(payload.provider).toBe("dify");
    expect(payload.reply).toContain("操作纸片");
    expect(payload.reply).toContain("导入与猜想");
  });

  it("在资料未命中且模型不可用时仍回应基础问候", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue(null);

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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "你好呀，我在这里。你想聊什么科学主题？" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "你好，科小贝" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "你好呀，我在这里。你想聊什么科学主题？",
      provider: "dify",
      photos: [],
      sources: [],
      labLinks: [],
    });
    expect(searchKnowledge).not.toHaveBeenCalled();
    expect(wantsPhotoResults).not.toHaveBeenCalled();
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: "你好，科小贝" }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
  });

  it("普通闲聊不检索资料库或附带实验入口", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("科小贝实验室：火山喷发", "无关实验资料")],
      photos: [],
    } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "天气很好，适合一起观察自然现象。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "今天天气真好" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "dify",
      photos: [],
      sources: [],
      labLinks: [],
    });
    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it("模型不可用时天气闲聊仍返回自然的对话兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue(null);

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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "当然可以，我们聊聊科学和生活。" });

    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "介绍一下你自己，我们随便聊聊" }),
      }),
    );

    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it("礼貌前缀和语气词形式的闲聊不会触发资料检索", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "我是科小贝。" });

    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "你好，介绍一下你自己" }),
      }),
    );
    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "讲个笑话吧" }),
      }),
    );

    expect(searchKnowledge).not.toHaveBeenCalled();
  });

  it("更自然的自我介绍和笑话问法仍保持对话模式", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "我是科小贝，很高兴和你聊天。" });

    for (const message of ["请介绍一下你自己好吗", "你能介绍下自己吗", "请讲个笑话吧"]) {
      await POST(
        new Request("http://localhost/api/ai-chat", {
          method: "POST",
          body: JSON.stringify({ message }),
        }),
      );
    }

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
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "可以试试玩转纸片。" });

    await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "今天天气真好，推荐一个实验" }),
      }),
    );

    expect(searchKnowledge).toHaveBeenCalledWith("今天天气真好，推荐一个实验");
  });

  it("没有资料意图的自然聊天不会误检索，并交给 Dify 对话", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "我很好，也很高兴和你聊天。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "你今天过得怎么样" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "我很好，也很高兴和你聊天。",
      sources: [],
      labLinks: [],
    });
    expect(searchKnowledge).not.toHaveBeenCalled();
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: "你今天过得怎么样" }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("systemPrompt");
  });

  it("自然语言科学问句仍检索资料库", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [chunk("水的蒸发", "水受热会蒸发。")],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "水受热后会逐渐蒸发。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "水为什么会蒸发？" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "水受热后会逐渐蒸发。",
      sources: ["水的蒸发"],
    });
    expect(searchKnowledge).toHaveBeenCalledWith("水为什么会蒸发？");
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("水为什么会蒸发？") }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]?.message).toContain("水受热会蒸发");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
  });

  it("明确请求小班光影实验时不会返回其他类型资源", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-poem-shadow",
        documentId: "POEM-shadow",
        title: "影子",
        document: { title: "科小贝实验室：影子" },
        content: "[LAB:POEM-shadow]\n类别：科学诗\n适用年龄：小班\n主题：光影\n摘要：一首关于影子的科学诗。",
      }],
      photos: [],
    } as never);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "推荐一个适合小班的光影实验，并说明材料和步骤。" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: expect.stringContaining("暂时没有匹配的小班科学实验"),
      sources: [],
      labLinks: [],
    });
    expect(generateDifyReply).not.toHaveBeenCalled();
  });

  it("科学特点问句优先返回资料中的原理而不是目录", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-magnet-principle",
        documentId: "EXP-magnet",
        title: "磁铁的秘密",
        document: { title: "科小贝实验室：磁铁的秘密" },
        content: "[LAB:EXP-magnet]\n类别：科学实验\n适用年龄：小班\n主题：磁力\n科学原理：磁铁有南极和北极，同极相斥、异极相吸，并能吸引铁磁性材料。",
      }],
      photos: [],
    } as never);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "磁极有什么特点？" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: expect.stringContaining("同极相斥、异极相吸"),
      provider: "fallback",
    });
    expect(generateDifyReply).not.toHaveBeenCalled();
  });

  it("裸输入科学主题也会检索并直接返回本地依据", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-POEM-magnet",
        documentId: "POEM-magnet",
        title: "磁铁的秘密",
        document: { title: "科小贝实验室：磁铁的秘密" },
        content: "[LAB:POEM-magnet]\n适用年龄：小班\n主题：磁力\n正文：磁铁姥姥穿花袄。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "磁铁可以吸住一些铁制品。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "磁铁" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: expect.stringContaining("磁铁的秘密"),
      provider: "fallback",
    });
    expect(searchKnowledge).toHaveBeenCalledWith("磁铁");
    expect(generateDifyReply).not.toHaveBeenCalled();
  });

  it("将浏览器会话传给 Dify，并返回新的 Dify conversation ID", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "我们继续聊科学吧。",
      conversationId: "dify-conversation-2",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "我们继续刚才的话题",
          userId: "web-session-1",
          conversationId: "dify-conversation-1",
        }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "我们继续聊科学吧。",
      provider: "dify",
      conversationId: "dify-conversation-2",
    });
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "我们继续刚才的话题",
        user: "web-session-1",
        conversationId: "dify-conversation-1",
      }),
    );
  });

  it("生成完整教案时不复用聊天中的旧 Dify 会话", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "《枣子是怎么来的》教案已生成。",
      conversationId: "fresh-lesson-conversation",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请生成一份完整教案。主题：枣子是怎么来的；班级（适用年龄段）：中班；活动时长：20 分钟。",
          conversationId: "old-unrelated-conversation",
        }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      conversationId: "fresh-lesson-conversation",
    });
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: undefined }),
    );
  });

  it("使用已配置的 Dify API 地址", async () => {
    const previousApiUrl = process.env.DIFY_API_URL;
    process.env.DIFY_API_URL = "https://dify.example/v1/chat-messages";
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "你好。" });

    try {
      await POST(
        new Request("http://localhost/api/ai-chat", {
          method: "POST",
          body: JSON.stringify({ message: "你好" }),
        }),
      );
      expect(generateDifyReply).toHaveBeenCalledWith(
        expect.objectContaining({ apiUrl: "https://dify.example/v1/chat-messages" }),
      );
    } finally {
      if (previousApiUrl === undefined) delete process.env.DIFY_API_URL;
      else process.env.DIFY_API_URL = previousApiUrl;
    }
  });

  it("接受 multipart 附件，先上传到 Dify 再把文件引用传给聊天请求", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-file-1",
    });
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "我可以基于这张图片继续观察。" });

    const formData = new FormData();
    formData.set("message", "请观察这张实验图片");
    formData.set("userId", "web-upload-user");
    formData.set(
      "attachment",
      new File([new Uint8Array([137, 80, 78, 71])], "experiment.png", { type: "image/png" }),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: formData,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "我可以基于这张图片继续观察。",
      attachment: { name: "experiment.png", status: "uploaded" },
    });
    expect(uploadDifyFile).toHaveBeenCalledWith(
      expect.objectContaining({ user: "web-upload-user", fileName: "experiment.png" }),
    );
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("请观察这张实验图片"),
        files: [
          {
            type: "image",
            transfer_method: "local_file",
            upload_file_id: "dify-file-1",
          },
        ],
      }),
    );
  });

  it("multipart 附件也保留流式聊天协议", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-file-stream",
    });
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response('data: {"event":"message","answer":"已收到图片"}\n\ndata: {"event":"message_end","conversation_id":"c-upload"}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const formData = new FormData();
    formData.set("message", "请查看实验图");
    formData.set("attachment", new File(["image"], "experiment.jpg", { type: "image/jpeg" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );

    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    expect(events[0]).toMatchObject({
      type: "meta",
      attachment: { name: "experiment.jpg", status: "uploaded" },
    });
    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "c-upload",
      attachment: { status: "uploaded" },
    });
    expect(openDifyStream).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ type: "image", transfer_method: "local_file", upload_file_id: "dify-file-stream" }],
      }),
    );
  });

  it("Word 教案走文档解析提示，不显示图片识别状态或视觉路由指令", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "document",
      transfer_method: "local_file",
      upload_file_id: "dify-docx-stream",
    });
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        'data: {"event":"message","answer":"已完成教案分析"}\n\ndata: {"event":"message_end","conversation_id":"docx-stream"}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请分析我上传的备课.docx教案");
    formData.set("conversationId", "old-text-conversation");
    formData.set(
      "attachment",
      new File(["docx"], "备课.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );

    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    expect(events).toEqual([
      {
        type: "meta",
        photos: [],
        sources: [],
        labLinks: [],
        attachment: { name: "备课.docx", status: "uploaded" },
      },
      { type: "status", message: "文档正在解析，模型分析可能需要几十秒，请保持页面打开。" },
      { type: "delta", delta: "已完成教案分析" },
      {
        type: "done",
        provider: "dify",
        reply: "已完成教案分析",
        conversationId: "docx-stream",
        responseId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        attachment: { name: "备课.docx", status: "uploaded" },
      },
    ]);
    expect(openDifyStream).toHaveBeenCalledWith(expect.objectContaining({ conversationId: undefined }));
    expect(vi.mocked(openDifyStream).mock.calls[0]?.[0].message).toContain("上传文档解析");
    expect(vi.mocked(openDifyStream).mock.calls[0]?.[0].message).not.toContain("检测到图片附件");
  });

  it("流式模型超时时，完整教案请求回退到教案正文而不是资料目录", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-STORY-water",
        documentId: "story-water",
        title: "会变色的小水滴",
        document: { title: "科小贝实验室：会变色的小水滴" },
        content: "无关资料。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({
          message: "请生成一份完整教案。年龄段：小班；主题：果农大冒险；活动时长：30 分钟；输出格式：Word 文档。",
        }),
      }),
    );
    const fallbackEvents = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    const payload = fallbackEvents.at(-1);
    expect(payload).toMatchObject({ provider: "fallback" });
    expect(payload.reply).toContain("《果农大冒险》完整教案");
    expect(payload.reply).toContain("活动过程");
    expect(payload.reply).not.toContain("我先为你整理已检索到的园本资料");
  });

  it("课件文档请求不会因年龄段和展示用途命中科学资料目录", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      chunks: [{
        id: "science-STORY-water",
        documentId: "story-water",
        title: "会变色的小水滴",
        document: { title: "科小贝实验室：会变色的小水滴" },
        content: "无关资料。",
      }],
      photos: [],
    } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "已生成课件提纲。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "请策划课件或教学文档。年龄段：小班；主题：果农大冒险；使用用途：家长会展示；输出格式：Word 文档。",
        }),
      }),
    );
    const payload = await response.json();

    expect(payload).toMatchObject({ provider: "dify", reply: "已生成课件提纲。" });
    expect(payload.reply).not.toContain("已从园本资料库中匹配到");
    expect(generateDifyReply).toHaveBeenCalled();
  });

  it("图片流只在完整 agent-result 到达后结束，不把开头围栏发成空消息", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-vision-stream",
    });
    const visionResult = {
      kind: "vision_observation",
      image_type: "实验材料图",
      facts: ["图片中可见透明杯"],
      judgements: ["可能用于观察液体变化"],
      missing_evidence: ["未看到完整操作过程"],
      actions: ["补充操作步骤照片"],
      safety: ["玻璃器皿由教师协助"],
      confidence: 0.84,
      privacy_visibility: "public_after_review",
      privacy_risk: false,
    };
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "```agent-result\n" })}`,
          "",
          `data: ${JSON.stringify({ event: "message", answer: JSON.stringify(visionResult) })}`,
          "",
          `data: ${JSON.stringify({ event: "message", answer: "\n```" })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "vision-stream" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("conversationId", "old-text-conversation");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.map((event) => event.type)).toEqual(["meta", "status", "done"]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "vision-stream",
      reply: "图片识别已完成，详细的可见内容、证据缺口和安全提醒见下方。",
      agentResult: { kind: "vision_observation", facts: ["图片中可见透明杯"] },
    });
    expect(openDifyStream).toHaveBeenCalledWith(expect.objectContaining({ conversationId: undefined }));
  });

  it("图片流在最终结构化占位符无效时回退到 qvq 节点输出", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-qvq-fallback",
    });
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "视觉实验分析" })}`,
          "",
          `data: ${JSON.stringify({ event: "message", answer: '{"type":"boolean"}' })}`,
          "",
          `data: ${JSON.stringify({
            event: "node_finished",
            conversation_id: "qvq-fallback",
            data: {
              node_type: "llm",
              title: "视觉实验观察",
              outputs: { text: "图片中可见透明杯、吸管和清水。" },
            },
          })}`,
          "",
          `data: ${JSON.stringify({
            event: "workflow_finished",
            data: { status: "succeeded", outputs: { result: '{"type":"boolean"}' } },
          })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请直接识别图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      reply: "图片中可见透明杯、吸管和清水。",
      conversationId: "qvq-fallback",
    });
  });

  it("图片流等待下游结构化结果，并优先返回它而不是 qvq 普通文本", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-qvq-structured",
    });
    const visionResult = {
      kind: "vision_observation",
      image_type: "实验材料图",
      facts: ["下游整理确认图片中可见透明杯"],
      judgements: ["材料摆放属于准备阶段"],
      missing_evidence: ["未看到完整操作过程"],
      actions: ["补充操作步骤照片"],
      safety: ["玻璃器皿由教师协助"],
      confidence: 0.9,
      privacy_visibility: "teacher_only",
      privacy_risk: false,
    };
    const structuredAnswer = ["```agent-result", JSON.stringify(visionResult), "```"].join("\n");
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "视觉实验分析" })}`,
          "",
          `data: ${JSON.stringify({
            event: "node_finished",
            conversation_id: "qvq-structured",
            data: {
              node_type: "llm",
              title: "qvq-max 视觉实验观察",
              outputs: { text: "qvq先看到透明杯和吸管。" },
            },
          })}`,
          "",
          `data: ${JSON.stringify({
            event: "message",
            answer: structuredAnswer,
          })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "qvq-structured" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.map((event) => event.type)).toEqual(["meta", "status", "done"]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "qvq-structured",
      reply: "图片识别已完成，详细的可见内容、证据缺口和安全提醒见下方。",
      agentResult: {
        kind: "vision_observation",
        facts: ["下游整理确认图片中可见透明杯"],
      },
    });
    expect(events.at(-1).reply).not.toContain("qvq先看到");
  });

  it("图片流将 Dify 四段式普通文本转换为视觉结果卡片", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-plain-vision",
    });
    const plainVisionAnswer = [
      "【可见证据】",
      "- 一个白色纸杯，杯口朝上",
      "- 一张浅蓝色纸片",
      "",
      "【不确定项】",
      "- 无法确认纸杯内是否有液体",
      "",
      "【安全提示】",
      "未见明确风险。",
      "",
      "【隐私提示】",
      "未见明显隐私线索。",
    ].join("\n");
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: plainVisionAnswer })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "plain-vision" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "plain-vision",
      reply: "图片识别已完成，详细的可见内容、证据缺口和安全提醒见下方。",
      agentResult: {
        kind: "vision_observation",
        facts: ["一个白色纸杯，杯口朝上", "一张浅蓝色纸片"],
        missing_evidence: ["无法确认纸杯内是否有液体"],
        privacy_risk: false,
      },
    });
  });

  it("阻塞图片请求也能解析 Dify 四段式普通文本", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-plain-vision-blocking",
    });
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "【可见证据】\n- 桌面上有透明杯和吸管",
        "【不确定项】\n- 未看到完整操作步骤",
        "【安全提示】\n玻璃容器应由教师协助使用",
        "【隐私提示】\n未见儿童人像或姓名信息",
      ].join("\n\n"),
    });

    const formData = new FormData();
    formData.set("message", "请分析这张实验图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: formData,
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "dify",
      agentResult: {
        kind: "vision_observation",
        facts: ["桌面上有透明杯和吸管"],
        judgements: ["未看到完整操作步骤"],
        safety: ["玻璃容器应由教师协助使用"],
      },
    });
  });

  it("qvq 四段式观察文本不会抢先结束，仍优先采用下游结构化结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-qvq-plain-then-structured",
    });
    const qvqPlainAnswer = [
      "【可见证据】\n- qvq 看到透明杯",
      "【不确定项】\n- qvq 无法确认液体状态",
      "【安全提示】\n未见明确风险",
      "【隐私提示】\n未见明显隐私线索",
    ].join("\n\n");
    const downstreamResult = {
      kind: "vision_observation",
      image_type: "实验材料图",
      facts: ["下游确认透明杯内有清水"],
      judgements: ["材料处于实验准备阶段"],
      missing_evidence: ["未看到操作过程"],
      actions: ["补充操作步骤照片"],
      safety: ["玻璃容器由教师协助"],
      confidence: 0.88,
      privacy_visibility: "public_after_review",
      privacy_risk: false,
    };
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({
            event: "node_finished",
            conversation_id: "qvq-plain-then-structured",
            data: {
              node_type: "llm",
              title: "qvq-max 视觉实验观察",
              outputs: { text: qvqPlainAnswer },
            },
          })}`,
          "",
          `data: ${JSON.stringify({
            event: "message",
            answer: ["```agent-result", JSON.stringify(downstreamResult), "```"].join("\n"),
          })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "qvq-plain-then-structured" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      agentResult: {
        kind: "vision_observation",
        facts: ["下游确认透明杯内有清水"],
      },
    });
  });

  it("视觉流为空时返回明确的可重试降级结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-empty-vision-stream",
    });
    vi.mocked(openDifyStream).mockResolvedValue(null);

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      agentResult: { kind: "degraded", code: "model_unavailable", retry: true },
      reply: expect.stringContaining("图片分析暂未完成"),
    });
  });

  it("图片上传失败时不把四段式文字误标为视觉识别结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue(null);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "【可见证据】\n请先重新上传图片",
        "【不确定项】\n当前没有可读取的附件",
        "【安全提示】\n请勿上传包含儿童姓名的图片",
        "【隐私提示】\n建议仅教师可见",
      ].join("\n\n"),
    });

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", { method: "POST", body: formData }),
    );
    const payload = await response.json();

    expect(payload.attachment).toMatchObject({ name: "experiment.png", status: "unavailable" });
    expect(payload.agentResult).toBeUndefined();
  });

  it("图片下游报错时仍用已暂存的 qvq 观察文本完成兜底", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "dify-qvq-error-fallback",
    });
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({
            event: "node_finished",
            conversation_id: "qvq-error-fallback",
            data: {
              node_type: "llm",
              title: "qvq-max 视觉实验观察",
              outputs: { text: "图片中可见透明杯和吸管。" },
            },
          })}`,
          "",
          `data: ${JSON.stringify({ event: "error", message: "下游建议节点暂时不可用" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const formData = new FormData();
    formData.set("message", "请识别这张图片");
    formData.set("attachment", new File(["image"], "experiment.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.map((event) => event.type)).toEqual(["meta", "status", "done"]);
    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "qvq-error-fallback",
      reply: "图片中可见透明杯和吸管。",
    });
  });

  it("附件上传失败时继续文字对话并明确标记降级状态", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(uploadDifyFile).mockResolvedValue(null);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "请先用文字描述图片中的材料和现象。" });

    const formData = new FormData();
    formData.set("message", "分析我的实验图");
    formData.set("attachment", new File(["text"], "notes.txt", { type: "text/plain" }));

    const response = await POST(
      new Request("http://localhost/api/ai-chat", { method: "POST", body: formData }),
    );

    await expect(response.json()).resolves.toMatchObject({
      attachment: {
        name: "notes.txt",
        status: "unavailable",
        message: "附件暂未上传，已继续文字对话；请稍后重试或补充文字描述。",
      },
    });
    expect(generateDifyReply).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("附件未能上传"),
      }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("files");
  });

  it("阻塞响应只暴露经过校验的 Dify 结构化结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "已完成图片观察。",
      metadata: {
        agent_result: {
          kind: "vision_observation",
          image_type: "实验过程照片",
          facts: ["桌面上有透明杯和清水"],
          judgements: ["可能是在观察水的流动"],
          missing_evidence: ["未看到完整操作过程"],
          actions: ["请补充倒水前后的照片"],
          safety: ["使用玻璃容器时由教师协助"],
          confidence: 0.76,
          privacy_visibility: "teacher_only",
          privacy_risk: false,
        },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "请分析这张实验图片" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      reply: "已完成图片观察。",
      agentResult: {
        kind: "vision_observation",
        facts: ["桌面上有透明杯和清水"],
        privacy_visibility: "teacher_only",
      },
    });
  });

  it("阻塞响应将不受信任的封面地址降级为可重试结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "封面已生成。",
        "```agent-result",
        JSON.stringify({
          kind: "poetry_cover",
          cover_url: "https://untrusted.example/cover.png",
          alt_text: "不应渲染的图片",
          theme_keywords: ["风"],
          generation_prompt: "幼儿绘本卡通风格",
          model_name: "Tongyi",
          retry: false,
        }),
        "```",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成风的旅行封面" }),
      }),
    );

    const payload = await response.json();
    expect(payload).toMatchObject({
      agentResult: {
        kind: "degraded",
        code: "untrusted_url",
        retry: true,
      },
    });
    expect(payload.agentResult.cover_url).toBeUndefined();
  });

  it("阻塞响应解析通义 Dify 图片文件并返回封面卡片", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "## 科学诗封面\n已由通义 AIGC 生成封面图片：",
      files: [{
        type: "image",
        transfer_method: "remote_url",
        remote_url: "https://upload.dify.ai/files/wind-trip.png",
        name: "风的旅行幼儿绘本封面.png",
      }],
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成风的旅行科学诗封面" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      agentResult: {
        kind: "poetry_cover",
        cover_url: "https://upload.dify.ai/files/wind-trip.png",
        model_name: "通义 AIGC",
      },
    });
  });

  it("阻塞响应只有通义图片文件时仍返回封面卡片", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "",
      files: [{
        type: "image",
        belongs_to: "assistant",
        url: "https://upload.dify.ai/files/wind-trip.png",
      }],
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《风的旅行》科学诗封面" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      agentResult: {
        kind: "poetry_cover",
        cover_url: "https://upload.dify.ai/files/wind-trip.png",
      },
    });
  });

  it("阻塞响应将受信任的 Dify 文档文件作为可下载输出返回", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "《玩转纸片》完整教案已生成。",
      files: [
        {
          type: "document",
          mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          name: "玩转纸片完整教案.docx",
          remote_url: "https://upload.dify.ai/files/paper-plan.docx",
        },
        {
          type: "document",
          mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          name: "不应显示的文件.docx",
          remote_url: "https://untrusted.example/files/unsafe.docx",
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );

    const payload = await response.json();
    expect(payload.files).toEqual([
      {
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "玩转纸片完整教案.docx",
        url: signedDownloadUrl(),
      },
    ]);
  });

  it("阻塞响应在 Dify 直接 files 为空时保留 metadata.files 中的教案", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "《玩转纸片》完整教案已生成。",
      files: [],
      metadata: {
        files: [{
          type: "document",
          name: "玩转纸片完整教案.docx",
          remote_url: "https://upload.dify.ai/files/download?file_id=paper-plan&sign=abc",
        }],
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      files: [{
        type: "document",
        name: "玩转纸片完整教案.docx",
        url: signedDownloadUrl(),
      }],
    });
  });

  it("阻塞响应跳过格式冲突的直接文件并读取 wrapped metadata 中的同 URL 教案", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    const signedUrl = "https://upload.dify.ai/files/download?file_id=paper-plan&sign=abc";
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "《玩转纸片》完整教案已生成。",
      files: [{
        type: "document",
        mime_type: "application/pdf",
        name: "玩转纸片完整教案.docx",
        remote_url: signedUrl,
      }],
      metadata: {
        outputs: [{
          files: [{
            type: "document",
            name: "玩转纸片完整教案.docx",
            remote_url: signedUrl,
          }],
        }],
      },
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );

    const payload = await response.json();
    expect(payload.files).toEqual([
      {
        type: "document",
        name: "玩转纸片完整教案.docx",
        url: signedDownloadUrl(),
      },
    ]);
  });

  it("阻塞响应将受信任 Markdown DOCX 链接作为文件输出", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: [
        "![科学诗封面](https://upload.dify.ai/files/cover.png)",
        "已生成：[下载完整教案.docx](https://upload.dify.ai/files/download?file_id=paper-plan&sign=abc)",
        "[外部文件.docx](https://untrusted.example/files/unsafe.docx)",
      ].join("\n"),
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );

    const payload = await response.json();
    expect(payload.files).toEqual([
      {
        type: "document",
        name: "下载完整教案.docx",
        url: signedDownloadUrl(),
      },
    ]);
  });

  it("阻塞响应不会在聊天正文暴露已交付 DOCX 的 Dify 直链", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "已生成：[课件教案.docx](https://upload.dify.ai/files/tools/paper-plan.docx?sign=abc)",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成完整教案并导出 DOCX" }),
      }),
    );

    const payload = await response.json();
    expect(payload.reply).toBe("已生成：课件教案.docx");
    expect(payload.reply).not.toContain("upload.dify.ai");
    expect(payload.files).toEqual([
      {
        type: "document",
        name: "课件教案.docx",
        url: signedDownloadUrl(),
      },
    ]);
  });

  it("流式响应在 done 事件中暴露经过校验的 Dify 结构化结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    const metadata = {
      agent_result: {
        kind: "experiment_recap",
        facts: ["两组幼儿完成了纸桥搭建"],
        goal_analysis: ["多数幼儿能比较纸桥承重"],
        issues: {
          materials: ["纸张厚度不一致"],
          steps: ["部分幼儿跳过预测"],
          questions: ["追问等待时间较短"],
          organization: ["材料集中发放"],
        },
        improvements: ["统一纸张规格并先完成预测记录"],
        validation_points: ["下次观察幼儿能否比较不同折法"],
        safety: ["剪刀由教师按需发放"],
      },
    };
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "复盘完成。" })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "recap-stream", metadata })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "复盘这次纸桥实验" }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      conversationId: "recap-stream",
      agentResult: {
        kind: "experiment_recap",
        facts: ["两组幼儿完成了纸桥搭建"],
        validation_points: ["下次观察幼儿能否比较不同折法"],
      },
    });
  });

  it("流式响应解析通义 Dify 图片文件并返回封面卡片", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "## 科学诗封面\\n已由通义 AIGC 生成封面图片：" })}`,
          "",
          `data: ${JSON.stringify({
            event: "message_end",
            files: [{ type: "image", remote_url: "https://upload.dify.ai/files/wind-trip.png" }],
          })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "生成风的旅行科学诗封面" }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      agentResult: {
        kind: "poetry_cover",
        cover_url: "https://upload.dify.ai/files/wind-trip.png",
      },
    });
  });

  it("流式响应将受信任的 Dify 文档文件作为可下载输出返回", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "《玩转纸片》完整教案已生成。" })}`,
          "",
          `data: ${JSON.stringify({
            event: "message_end",
            files: [
              {
                type: "document",
                mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                name: "玩转纸片完整教案.docx",
                remote_url: "https://upload.dify.ai/files/paper-plan.docx",
              },
              {
                type: "document",
                name: "不应显示的文件.docx",
                remote_url: "https://untrusted.example/files/unsafe.docx",
              },
            ],
          })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(events.at(-1)?.files).toEqual([
      {
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "玩转纸片完整教案.docx",
        url: signedDownloadUrl(),
      },
    ]);
  });

  it("流式教案仅在回答 Markdown 链接中返回 DOCX 时也能交付文件", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({
            event: "message",
            answer: "[枣子是怎么来的完整教案.docx](https://upload.dify.ai/files/tools/jujube-plan.docx?timestamp=1&sign=abc)",
          })}`,
          "",
          `data: ${JSON.stringify({ event: "message_end", conversation_id: "lesson-file-link" })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({
          message: "请生成一份完整教案。主题：枣子是怎么来的；班级（适用年龄段）：中班；活动时长：20 分钟。",
        }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      files: [{
        type: "document",
        name: "枣子是怎么来的完整教案.docx",
        url: signedDownloadUrl(),
      }],
    });
  });

  it("流式响应在 Dify 直接 files 为空时保留 metadata.files 中的教案", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "《玩转纸片》完整教案已生成。" })}`,
          "",
          `data: ${JSON.stringify({
            event: "message_end",
            files: [],
            metadata: {
              files: [{
                type: "document",
                name: "玩转纸片完整教案.docx",
                remote_url: "https://upload.dify.ai/files/download?file_id=paper-plan&sign=abc",
              }],
            },
          })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "生成《玩转纸片》完整教案" }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)?.files).toEqual([
      {
        type: "document",
        name: "玩转纸片完整教案.docx",
        url: signedDownloadUrl(),
      },
    ]);
  });

  it("拒绝超过大小限制的 multipart 附件", async () => {
    const formData = new FormData();
    formData.set("message", "请分析附件");
    formData.set("attachment", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));

    const response = await POST(
      new Request("http://localhost/api/ai-chat", { method: "POST", body: formData }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "附件不能超过 4MB" });
    expect(uploadDifyFile).not.toHaveBeenCalled();
  });

  it("拒绝直接上传视频，并提示先提取关键帧或文字记录", async () => {
    const formData = new FormData();
    formData.set("message", "请分析这段实验视频");
    formData.set("attachment", new File(["video"], "experiment.mp4", { type: "video/mp4" }));

    const response = await POST(
      new Request("http://localhost/api/ai-chat", { method: "POST", body: formData }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "暂不支持直接上传视频，请先提取关键帧或整理文字记录后再上传。",
    });
    expect(uploadDifyFile).not.toHaveBeenCalled();
  });

  it("拒绝 MIME 与图片扩展名不一致的附件", async () => {
    const formData = new FormData();
    formData.set("message", "请分析附件");
    formData.set("attachment", new File(["not-an-image"], "experiment.png", { type: "application/pdf" }));

    const response = await POST(
      new Request("http://localhost/api/ai-chat", { method: "POST", body: formData }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "附件类型与文件扩展名不一致，请重新选择原始文件。",
    });
    expect(uploadDifyFile).not.toHaveBeenCalled();
  });

  it("为明确指定的科学诗将生成封面同步到对应资源，并返回持久化后的地址", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "科学诗封面已生成。",
      files: [{
        type: "image",
        remote_url: "https://upload.dify.ai/files/wind-trip.png",
        name: "风的旅行封面.png",
      }],
    });
    vi.mocked(synchronizeSciencePoetryCover).mockResolvedValue({
      itemId: "POEM-wind-trip",
      title: "风的旅行",
      coverUrl: "https://blob.vercel-storage.com/science-resource-covers/wind-trip.png",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "为《风的旅行》生成科学诗封面",
          targetResourceId: "POEM-wind-trip",
        }),
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      agentResult: {
        kind: "poetry_cover",
        cover_url: "https://upload.dify.ai/files/wind-trip.png",
      },
      coverSync: {
        itemId: "POEM-wind-trip",
        title: "风的旅行",
        coverUrl: "https://blob.vercel-storage.com/science-resource-covers/wind-trip.png",
      },
    });
    expect(synchronizeSciencePoetryCover).toHaveBeenCalledWith(
      "POEM-wind-trip",
      "https://upload.dify.ai/files/wind-trip.png",
      expect.objectContaining({ difyApiKey: "route-test-dify-key" }),
    );
  });

  it("没有目标资源 ID 时只返回聊天封面，不触发资料库写入", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({
      answer: "科学诗封面已生成。",
      files: [{ type: "image", remote_url: "https://upload.dify.ai/files/wind-trip.png" }],
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({ message: "生成《风的旅行》科学诗封面" }),
      }),
    );

    const payload = await response.json();
    expect(payload.agentResult).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip.png",
    });
    expect(payload.coverSync).toBeUndefined();
    expect(synchronizeSciencePoetryCover).not.toHaveBeenCalled();
  });

  it("没有解析到有效封面图片时，即使给出目标资源也不写入资料库", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "封面暂时无法生成，请稍后重试。" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        body: JSON.stringify({
          message: "为《风的旅行》生成科学诗封面",
          targetResourceId: "POEM-wind-trip",
        }),
      }),
    );

    const payload = await response.json();
    expect(payload.agentResult).toMatchObject({ kind: "degraded", code: "generation_failed" });
    expect(payload.coverSync).toBeUndefined();
    expect(synchronizeSciencePoetryCover).not.toHaveBeenCalled();
  });

  it("流式聊天在完成事件中返回科学诗封面同步结果", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(
      new Response(
        [
          `data: ${JSON.stringify({ event: "message", answer: "科学诗封面已生成。" })}`,
          "",
          `data: ${JSON.stringify({
            event: "message_end",
            files: [{ type: "image", remote_url: "https://upload.dify.ai/files/wind-trip.png" }],
          })}`,
          "",
        ].join("\n"),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.mocked(synchronizeSciencePoetryCover).mockResolvedValue({
      itemId: "POEM-wind-trip",
      title: "风的旅行",
      coverUrl: "https://blob.vercel-storage.com/science-resource-covers/wind-trip.png",
    });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({
          message: "为《风的旅行》生成科学诗封面",
          targetResourceId: "POEM-wind-trip",
        }),
      }),
    );
    const events = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    expect(events.at(-1)).toMatchObject({
      type: "done",
      coverSync: {
        itemId: "POEM-wind-trip",
        title: "风的旅行",
        coverUrl: "https://blob.vercel-storage.com/science-resource-covers/wind-trip.png",
      },
    });
    expect(synchronizeSciencePoetryCover).toHaveBeenCalledWith(
      "POEM-wind-trip",
      "https://upload.dify.ai/files/wind-trip.png",
      expect.objectContaining({ difyApiKey: "route-test-dify-key" }),
    );
  });
});
