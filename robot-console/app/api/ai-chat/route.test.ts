import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { maxDuration, POST } from "./route";
import { generateDifyReply, openDifyStream, uploadDifyFile } from "@/lib/dify";
import { searchKnowledge, wantsPhotoResults } from "@/lib/search";

const chunk = (title: string, content: string) => ({
  document: { title },
  content,
});

describe("POST /api/ai-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("并行启动资料检索与 Dify 请求，避免两段等待时间相加", async () => {
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
    expect(difyStarted).toBe(true);

    releaseSearch({ chunks: [], photos: [] } as never);
    releaseDify({ answer: "可以试试一个小班科学实验。" } as never);
    await expect(responsePromise).resolves.toBeInstanceOf(Response);
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

  it("流式通道不可用时仍返回旧 JSON 协议", async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({ chunks: [], photos: [] } as never);
    vi.mocked(wantsPhotoResults).mockReturnValue(false);
    vi.mocked(openDifyStream).mockResolvedValue(null);
    vi.mocked(generateDifyReply).mockResolvedValue({ answer: "降级回复" });

    const response = await POST(
      new Request("http://localhost/api/ai-chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ message: "你好" }),
      }),
    );

    expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    await expect(response.json()).resolves.toMatchObject({ reply: "降级回复", provider: "dify" });
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
        body: JSON.stringify({ message: "推荐一个小班科学实验" }),
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
        message: "介绍园所",
      }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("history");
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
      expect.objectContaining({ message: "生成《玩转纸片》完整教案" }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("maxTokens");
  });

  it("模型缺少观察、小结和提示时保留正文并补齐板块", async () => {
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
    expect(payload.reply).toContain("观察与小结");
    expect(payload.reply).toContain("活动小结");
    expect(payload.reply).toContain("延伸与安全提示");
  });

  it("保留 Dify 已生成的教案正文，并补齐缺失板块", async () => {
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
    expect(payload.reply).toContain("观察与小结");
    expect(payload.reply).toContain("延伸与安全提示");
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
      expect.objectContaining({ message: "水为什么会蒸发？" }),
    );
    expect(vi.mocked(generateDifyReply).mock.calls[0]?.[0]).not.toHaveProperty("context");
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
        message: "请观察这张实验图片",
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
});
