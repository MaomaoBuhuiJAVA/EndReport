import { describe, expect, it, vi } from "vitest";
import { generateDifyReply, openDifyStream, parseDifyStream, uploadDifyFile } from "./dify";

describe("generateDifyReply", () => {
  it("uses Dify blocking chat messages and returns its conversation ID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "  你好，我是科小贝。  ",
          conversation_id: "conversation-123",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      generateDifyReply({
        apiKey: "test-key",
        apiUrl: "https://dify.example/v1/chat-messages",
        message: "推荐一个小班实验",
        user: "web-test-user",
        conversationId: "conversation-122",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({ answer: "你好，我是科小贝。", conversationId: "conversation-123" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dify.example/v1/chat-messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      }),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      inputs: {},
      query: "推荐一个小班实验",
      response_mode: "blocking",
      user: "web-test-user",
      conversation_id: "conversation-122",
    });
  });

  it("preserves Dify metadata for the structured-result transport layer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "已生成结构化观察结果。",
          metadata: { agent_result: { kind: "vision_observation" } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      generateDifyReply({
        apiKey: "test-key",
        message: "分析这张实验图片",
        user: "web-test-user",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({
      answer: "已生成结构化观察结果。",
      metadata: { agent_result: { kind: "vision_observation" } },
    });
  });

  it("preserves Dify image files for the Tongyi result transport layer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "## 科学诗封面\n已由通义 AIGC 生成封面图片：",
          files: [{ type: "image", remote_url: "https://upload.dify.ai/files/cover.png" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      generateDifyReply({
        apiKey: "test-key",
        message: "生成科学诗封面",
        user: "web-test-user",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toMatchObject({
      files: [{ type: "image", remote_url: "https://upload.dify.ai/files/cover.png" }],
    });
  });

  it("keeps a blocking Tongyi file response even when answer is empty", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "",
          files: [{ type: "image", url: "https://upload.dify.ai/files/cover.png" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      generateDifyReply({
        apiKey: "test-key",
        message: "生成科学诗封面",
        user: "web-test-user",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toMatchObject({
      answer: "",
      files: [{ type: "image", url: "https://upload.dify.ai/files/cover.png" }],
    });
  });

  it("does not expose Dify failures and falls back when configuration is absent", async () => {
    const rejectedFetch = vi.fn().mockResolvedValue(new Response("provider failure", { status: 500 }));

    await expect(
      generateDifyReply({ apiKey: "test-key", message: "你好", user: "web-test-user", fetchImpl: rejectedFetch as typeof fetch }),
    ).resolves.toBeNull();
    await expect(generateDifyReply({ message: "你好", user: "web-test-user" })).resolves.toBeNull();
    expect(rejectedFetch).toHaveBeenCalledOnce();
  });

  it("includes uploaded file references in the chat payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ answer: "我看到了这张实验图片。" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await generateDifyReply({
      apiKey: "test-key",
      apiUrl: "https://dify.example/v1/chat-messages",
      message: "请观察附件中的实验现象",
      user: "web-test-user",
      files: [
        {
          type: "image",
          transfer_method: "local_file",
          upload_file_id: "file-123",
        },
      ],
      fetchImpl: fetchImpl as typeof fetch,
    });

    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      files: [
        {
          type: "image",
          transfer_method: "local_file",
          upload_file_id: "file-123",
        },
      ],
    });
  });

  it("uploads a browser file and returns Dify's local file id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "file-456", name: "experiment.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const file = new File([new Uint8Array([137, 80, 78, 71])], "experiment.png", {
      type: "image/png",
    });

    await expect(
      uploadDifyFile({
        apiKey: "test-key",
        apiUrl: "https://dify.example/v1/chat-messages",
        file,
        user: "web-test-user",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({
      type: "image",
      transfer_method: "local_file",
      upload_file_id: "file-456",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://dify.example/v1/files/upload",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer test-key" },
      }),
    );
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("user")).toBe("web-test-user");
    expect((request.body as FormData).get("file")).toBeInstanceOf(File);
  });
});

describe("Dify streaming chat", () => {
  it("uses streaming chat messages and preserves the response body", async () => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"event\":\"message\",\"answer\":\"你好\"}\n\n"));
        controller.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(streamBody, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    const response = await openDifyStream({
      apiKey: "test-key",
      apiUrl: "https://dify.example/v1/chat-messages",
      message: "你好",
      user: "web-test-user",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(response?.status).toBe(200);
    const request = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      query: "你好",
      response_mode: "streaming",
      user: "web-test-user",
    });
  });

  it("times out when the streaming request never returns headers", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    );

    try {
      const pending = openDifyStream({
        apiKey: "test-key",
        message: "你好",
        user: "web-test-user",
        fetchImpl: fetchImpl as typeof fetch,
      });
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(120_000);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses split Dify SSE events into answer deltas and conversation IDs", async () => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("data: {\"event\":\"message\",\"answer\":\"你好\"}\n"));
        controller.enqueue(encoder.encode("\ndata: {\"event\":\"message_end\",\"conversation_id\":\"conversation-123\"}\n\n"));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseDifyStream(streamBody)) events.push(event);

    expect(events).toEqual([
      { event: "message", answer: "你好" },
      { event: "message_end", conversationId: "conversation-123" },
    ]);
  });

  it("preserves structured-result metadata from a Dify streaming event", async () => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"event":"message_end","metadata":{"agent_result":{"kind":"experiment_recap"}}}\n\n',
        ));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseDifyStream(streamBody)) events.push(event);

    expect(events).toEqual([
      { event: "message_end", metadata: { agent_result: { kind: "experiment_recap" } } },
    ]);
  });

  it("preserves image files from a Dify streaming event", async () => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"event":"message_end","files":[{"type":"image","remote_url":"https://upload.dify.ai/files/cover.png"}]}\n\n',
        ));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseDifyStream(streamBody)) events.push(event);

    expect(events).toEqual([
      { event: "message_end", files: [{ type: "image", remote_url: "https://upload.dify.ai/files/cover.png" }] },
    ]);
  });

  it("normalizes Dify message_file events from Tongyi image generation", async () => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'data: {"event":"message_file","type":"image","id":"file-1","url":"https://upload.dify.ai/files/cover.png","belongs_to":"assistant"}\n\n',
        ));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseDifyStream(streamBody)) events.push(event);

    expect(events).toEqual([
      {
        event: "message_file",
        files: [{
          type: "image",
          transfer_method: "remote_url",
          url: "https://upload.dify.ai/files/cover.png",
          id: "file-1",
          belongs_to: "assistant",
        }],
      },
    ]);
  });
});
