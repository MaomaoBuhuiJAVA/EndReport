import { describe, expect, it, vi } from "vitest";
import { generateDeepSeekReply } from "@/lib/deepseek";

describe("generateDeepSeekReply", () => {
  it("发送系统规则、受限资料上下文、近期历史和当前问题", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "园所回复" } }] }), { status: 200 }),
    );

    await expect(
      generateDeepSeekReply({
        apiKey: "test-key",
        apiUrl: "https://example.test/chat",
        systemPrompt: "仅依据资料回答",
        context: "[园所简介] 省二级幼儿园",
        history: [{ role: "user", content: "之前的问题" }],
        message: "园所是什么？",
        fetchImpl,
      }),
    ).resolves.toBe("园所回复");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/chat",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "deepseek-chat",
      messages: expect.arrayContaining([
        { role: "system", content: "仅依据资料回答" },
        { role: "system", content: expect.stringContaining("园所简介") },
        { role: "user", content: "园所是什么？" },
      ]),
    });
  });

  it.each([
    new Response("", { status: 502 }),
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
  ])("模型不可用或回复为空时返回 null", async (response) => {
    await expect(
      generateDeepSeekReply({
        apiKey: "test-key",
        apiUrl: "https://example.test/chat",
        systemPrompt: "规则",
        context: "资料",
        history: [],
        message: "问题",
        fetchImpl: vi.fn().mockResolvedValue(response),
      }),
    ).resolves.toBeNull();
  });

  it("keeps the latest twelve chat messages for a continuing conversation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "继续回答" } }] }), { status: 200 }),
    );
    const history = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `历史${index + 1}`,
    }));

    await generateDeepSeekReply({
      apiKey: "test-key",
      apiUrl: "https://example.test/chat",
      systemPrompt: "规则",
      context: "资料",
      history,
      message: "继续问",
      fetchImpl,
    });

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(request.body as string) as { messages: Array<{ content: string }> };
    const historyContents = payload.messages.slice(2, -1).map((entry) => entry.content);

    expect(historyContents).toEqual(Array.from({ length: 12 }, (_, index) => `历史${index + 3}`));
  });
});
