import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dify", () => ({ generateDifyReply: vi.fn() }));

import { generateDifyReply } from "@/lib/dify";
import { POST } from "./route";

describe("POST /api/science-resources/generate-cover", () => {
  const originalDifyApiKey = process.env.DIFY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIFY_API_KEY = "cover-route-test-key";
  });

  afterEach(() => {
    if (originalDifyApiKey === undefined) delete process.env.DIFY_API_KEY;
    else process.env.DIFY_API_KEY = originalDifyApiKey;
  });

  it("requires a text-free science poem cover in the image-generation prompt", async () => {
    vi.mocked(generateDifyReply).mockResolvedValue(null);

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

    const prompt = vi.mocked(generateDifyReply).mock.calls[0]?.[0]?.message ?? "";
    expect(prompt).toContain("明亮、友好、原创卡通绘本风格");
    expect(prompt).toContain("题名和作者不参与绘图");
    expect(prompt).toContain("中文汉字、英文或其他拉丁字母、数字");
    expect(prompt).toContain("标签、标志、徽章、品牌元素、水印或乱码式伪文字");
    expect(prompt).toContain("ZERO text or text-like marks");
    expect(prompt).toContain("No Chinese characters, Latin or English letters, numbers");
    expect(prompt).not.toContain("会发光的萤火虫");
    expect(prompt).not.toContain("小朋友");
  });
});
