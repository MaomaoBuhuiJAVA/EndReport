import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/science-cover-sync", () => ({
  persistScienceCoverImage: vi.fn(),
  persistSciencePoetryCoverUrl: vi.fn(),
  persistScienceCoverUrl: vi.fn(),
}));

import { persistScienceCoverImage, persistScienceCoverUrl, persistSciencePoetryCoverUrl } from "@/lib/science-cover-sync";
import { POST } from "./route";

describe("POST /api/science-resources/generate-cover", () => {
  const originalDifyApiKey = process.env.DIFY_API_KEY;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DIFY_API_KEY = "cover-route-test-key";
    vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
    vi.stubEnv("QWEN_TTS_API_KEY", "shared-image-speech-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/generated.png"}]}}]}})));
  });

  afterEach(() => {
    if (originalDifyApiKey === undefined) delete process.env.DIFY_API_KEY;
    else process.env.DIFY_API_KEY = originalDifyApiKey;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it.each([null, [], "invalid", 42])("rejects malformed JSON input before image generation: %s", async body => {
    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {method: "POST", headers: {"Content-Type": "application/json", "x-forwarded-for": `203.0.113.${body === null ? 1 : Array.isArray(body) ? 2 : typeof body === "string" ? 3 : 4}`}, body: JSON.stringify(body)}));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a text-free science poem cover in the image-generation prompt", async () => {


    await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "会发光的萤火虫",
        category: "科学诗",
        topic: "昆虫与发光现象",
        poem: "小小萤火虫，点亮夏夜的灯。",
        author: "小朋友",
      }),
    }));

    const prompt = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).input.messages[0].content[0].text;
    expect(prompt).toContain("明亮、友好、原创卡通绘本风格");
    expect(prompt).toContain("题名和作者不参与绘图");
    expect(prompt).toContain("中文汉字、英文或其他拉丁字母、数字");
    expect(prompt).toContain("标签、标志、徽章、品牌元素、水印或乱码式伪文字");
    expect(prompt).toContain("ZERO text or text-like marks");
    expect(prompt).toContain("No Chinese characters, Latin or English letters, numbers");
    expect(prompt).not.toContain("会发光的萤火虫");
    expect(prompt).not.toContain("小朋友");
  });

  it("writes the generated cover back to the newly created poem in the same request", async () => {
    vi.mocked(persistScienceCoverImage).mockResolvedValue(
      "/api/media/uploads/science-resource-covers/tissue.png",
    );
    vi.mocked(persistSciencePoetryCoverUrl).mockResolvedValue({
      itemId: "POEM-tissue",
      title: "测试",
      coverUrl: "/api/media/uploads/science-resource-covers/tissue.png",
    });

    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId: "POEM-tissue",
        title: "测试",
        category: "科学诗",
        poem: "纸巾纸巾纸巾",
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(persistSciencePoetryCoverUrl).toHaveBeenCalledWith(
      "POEM-tissue",
      "/api/media/uploads/science-resource-covers/tissue.png",
    );
    expect(payload).toEqual(expect.objectContaining({
      coverUrl: "/api/media/uploads/science-resource-covers/tissue.png",
      itemId: "POEM-tissue",
      persisted: true,
      synced: true,
    }));
  });

  it("generates an uploaded-poem cover directly and returns its durable OSS media path", async () => {
    vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
    vi.stubEnv("DIFY_API_KEY", "");
    vi.stubEnv("QWEN_TTS_API_KEY", "shared-image-speech-key");
    const upstream = vi.fn().mockResolvedValue(Response.json({ output: { choices: [{ message: { content: [{ image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.png" }] } }] } }));
    vi.stubGlobal("fetch", upstream);
    const coverUrl = "/api/media/uploads/science-resource-covers/wind.png";
    vi.mocked(persistScienceCoverImage).mockResolvedValue(coverUrl);
    vi.mocked(persistSciencePoetryCoverUrl).mockResolvedValue({ itemId: "POEM-wind", title: "风的旅行", coverUrl });

    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.21" },
      body: JSON.stringify({ itemId: "POEM-wind", title: "风的旅行", category: "科学诗", poem: "小风吹着树叶，一起轻轻摇。" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ coverUrl, itemId: "POEM-wind", persisted: true, synced: true });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0] ?? "")).not.toContain("dify");
    expect(upstream).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(upstream.mock.calls[0][1].body);
    expect(payload.input.messages[0].content[0].text).toContain("小风吹着树叶");
    expect(payload.parameters.size).toBe("1328*1328");
    expect(persistSciencePoetryCoverUrl).toHaveBeenCalledWith("POEM-wind", coverUrl);
  });

  it("keeps the actual image usable when OSS persistence fails without saving an expiring cover reference", async () => {
    vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
    vi.stubEnv("QWEN_TTS_API_KEY", "shared-image-speech-key");
    const sourceUrl = "https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.png";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ output: { choices: [{ message: { content: [{ image: sourceUrl }] } }] } })));
    vi.mocked(persistScienceCoverImage).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.22" },
      body: JSON.stringify({ itemId: "POEM-wind", title: "风的旅行", poem: "小风吹着树叶。" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ coverUrl: sourceUrl, persisted: false, synced: false });
    expect(persistSciencePoetryCoverUrl).not.toHaveBeenCalled();
  });

  it("does not return an unreadable private media path when database writeback fails", async () => {
    vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
    vi.stubEnv("QWEN_TTS_API_KEY", "shared-image-speech-key");
    const sourceUrl = "https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.png";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ output: { choices: [{ message: { content: [{ image: sourceUrl }] } }] } })));
    vi.mocked(persistScienceCoverImage).mockResolvedValue("/api/media/uploads/science-resource-covers/wind.png");
    vi.mocked(persistSciencePoetryCoverUrl).mockRejectedValue(new Error("database unavailable"));

    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.23" },
      body: JSON.stringify({ itemId: "POEM-wind", title: "风的旅行" }),
    }));
    expect(await response.json()).toMatchObject({ coverUrl: sourceUrl, persisted: false, synced: false });
  });

  it("persists story covers through the same private OSS delivery route", async () => {
    vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
    vi.stubEnv("QWEN_TTS_API_KEY", "shared-image-speech-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ output: { choices: [{ message: { content: [{ image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/story.png" }] } }] } })));
    const coverUrl = "/api/media/uploads/science-resource-covers/story.png";
    vi.mocked(persistScienceCoverImage).mockResolvedValue(coverUrl);
    vi.mocked(persistScienceCoverUrl).mockResolvedValue({ itemId: "STORY-wind", title: "风的故事", coverUrl });

    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.24" },
      body: JSON.stringify({ itemId: "STORY-wind", title: "风的故事", category: "科学故事", topic: "风" }),
    }));
    expect(await response.json()).toMatchObject({ coverUrl, itemId: "STORY-wind", persisted: true, synced: true });
    expect(persistScienceCoverUrl).toHaveBeenCalledWith("STORY-wind", coverUrl, "科学故事");
  });

  it("returns a useful configuration error without invoking Dify when native image credentials are absent", async () => {
    vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
    for (const key of ["AI_IMAGE_API_KEY", "QWEN_API_KEY", "DASHSCOPE_API_KEY", "QWEN_TTS_API_KEY"]) vi.stubEnv(key, "");
    const response = await POST(new Request("http://localhost/api/science-resources/generate-cover", {
      method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.25" },
      body: JSON.stringify({ title: "风的旅行" }),
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/配置/u), fallbackUrl: "/lab-category-buttons/poetry.png" });
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0] ?? "")).not.toContain("dify");
  });
});
