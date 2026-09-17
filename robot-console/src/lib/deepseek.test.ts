import { describe, expect, it, vi } from "vitest";
import { generateDeepSeekReply } from "@/lib/deepseek";

describe("generateDeepSeekReply", () => {
  it("sends grounded context and recent conversation history", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "  园所资料回复  " } }] }), { status: 200 }),
    );

    await expect(generateDeepSeekReply({
      apiKey: "test-key",
      apiUrl: "https://deepseek.example/chat",
      systemPrompt: "只依据资料回答",
      context: "省二级幼儿园",
      history: [{ role: "user", content: "上一个问题" }],
      message: "请介绍园所",
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBe("园所资料回复");

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { messages: Array<{ role: string; content: string }> };
    expect(payload.messages).toEqual(expect.arrayContaining([
      { role: "system", content: "只依据资料回答" },
      { role: "user", content: "上一个问题" },
      { role: "user", content: "请介绍园所" },
    ]));
    expect(payload.messages[1]?.content).toContain("省二级幼儿园");
  });

  it.each([
    new Response("", { status: 502 }),
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
  ])("returns null for an unavailable model or an empty reply", async (response) => {
    await expect(generateDeepSeekReply({
      apiKey: "test-key",
      apiUrl: "https://deepseek.example/chat",
      systemPrompt: "规则",
      context: "资料",
      history: [],
      message: "问题",
      fetchImpl: vi.fn().mockResolvedValue(response) as typeof fetch,
    })).resolves.toBeNull();
  });

  it("keeps the latest twelve chat messages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "继续回答" } }] }), { status: 200 }),
    );
    const history = Array.from({ length: 14 }, (_, index) => ({
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `历史${index + 1}`,
    }));

    await generateDeepSeekReply({
      apiKey: "test-key",
      apiUrl: "https://deepseek.example/chat",
      systemPrompt: "规则",
      context: "资料",
      history,
      message: "继续问",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { messages: Array<{ content: string }> };
    const historyContents = payload.messages.slice(2, -1).map((entry) => entry.content);
    expect(historyContents).toEqual(Array.from({ length: 12 }, (_, index) => `历史${index + 3}`));
  });

  it("allows normal fallback requests to use the full timeout", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });

    try {
      const replyPromise = generateDeepSeekReply({
        apiKey: "test-key",
        systemPrompt: "规则",
        context: "资料",
        history: [],
        message: "生成完整教案",
        fetchImpl: fetchImpl as typeof fetch,
      });

      await vi.advanceTimersByTimeAsync(29_000);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(replyPromise).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call the provider for redacted local credentials", async () => {
    const fetchImpl = vi.fn();
    await expect(generateDeepSeekReply({
      apiKey: "[SENSITIVE]",
      systemPrompt: "规则",
      context: "",
      history: [],
      message: "你好",
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when the secondary provider rejects the request", async () => {
    await expect(generateDeepSeekReply({
      apiKey: "test-key",
      systemPrompt: "规则",
      context: "",
      history: [],
      message: "你好",
      fetchImpl: vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })) as typeof fetch,
    })).resolves.toBeNull();
  });
});
