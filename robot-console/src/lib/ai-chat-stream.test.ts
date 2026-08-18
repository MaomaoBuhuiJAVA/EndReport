import { describe, expect, it } from "vitest";
import { parseAiChatStream, readAiChatResponse, type AiChatStreamEvent } from "./ai-chat-stream";

describe("parseAiChatStream", () => {
  it("parses SSE events even when frames arrive across chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"type":"meta","sources":[]}\n'));
        controller.enqueue(encoder.encode('\ndata: {"type":"delta","delta":"你好"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"done","provider":"dify","reply":"你好"}\n\n'));
        controller.close();
      },
    });

    const events = [];
    for await (const event of parseAiChatStream(new Response(body))) events.push(event);

    expect(events).toEqual([
      { type: "meta", sources: [] },
      { type: "delta", delta: "你好" },
      { type: "done", provider: "dify", reply: "你好" },
    ]);
  });

  it("returns no events when the response has no body", async () => {
    const events = [];
    for await (const event of parseAiChatStream(new Response(null))) events.push(event);
    expect(events).toEqual([]);
  });

  it("returns the accumulated reply and exposes each streaming update", async () => {
    const response = new Response(
      'data: {"type":"meta","photos":[]}\n\n' +
        'data: {"type":"delta","delta":"先到"}\n\n' +
        'data: {"type":"done","provider":"dify","reply":"先到后续","conversationId":"c-1","responseId":"2b7aec24-b5d5-4e53-8d29-ddf98c8421a9"}\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const updates: AiChatStreamEvent[] = [];

    await expect(readAiChatResponse(response, (event) => updates.push(event))).resolves.toEqual({
      reply: "先到后续",
      provider: "dify",
      conversationId: "c-1",
      responseId: "2b7aec24-b5d5-4e53-8d29-ddf98c8421a9",
      photos: [],
    });
    expect(updates.map((event) => event.type)).toEqual(["meta", "delta", "done"]);
  });

  it("normalizes the JSON fallback response", async () => {
    await expect(
      readAiChatResponse(
        new Response(JSON.stringify({ reply: "旧协议", provider: "fallback", sources: ["资料"] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).resolves.toEqual({ reply: "旧协议", provider: "fallback", sources: ["资料"] });
  });

  it("preserves safe Dify document downloads from JSON responses", async () => {
    const result = await readAiChatResponse(
      new Response(JSON.stringify({
          reply: "教案已生成。",
          files: [
            {
              type: "document",
              mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              name: "玩转纸片完整教案.docx",
              url: "https://upload.dify.ai/files/paper-plan.docx",
            },
            {
              type: "document",
              name: "不应显示的文件.docx",
              url: "https://untrusted.example/files/unsafe.docx",
            },
          ],
        }), { headers: { "Content-Type": "application/json" } }),
    );
    expect(result.files).toEqual([
      {
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "玩转纸片完整教案.docx",
        url: "https://upload.dify.ai/files/paper-plan.docx",
      },
    ]);
  });

  it("preserves safe Dify document downloads from streaming done events", async () => {
    const response = new Response(
      'data: {"type":"done","provider":"dify","reply":"教案已生成。","files":[{"type":"document","mimeType":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","name":"玩转纸片完整教案.docx","url":"https://upload.dify.ai/files/paper-plan.docx"},{"type":"document","name":"不应显示的文件.docx","url":"https://untrusted.example/files/unsafe.docx"}]}\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );

    const result = await readAiChatResponse(response);
    expect(result.files).toEqual([
      {
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "玩转纸片完整教案.docx",
        url: "https://upload.dify.ai/files/paper-plan.docx",
      },
    ]);
  });

  it("exposes a validated structured result embedded in a completed reply", async () => {
    const structuredResult = JSON.stringify({
      kind: "vision_observation",
      image_type: "实验照片",
      facts: ["有一杯清水"],
      judgements: ["可能在观察水的变化"],
      missing_evidence: ["缺少操作前照片"],
      actions: ["补充实验步骤"],
      safety: ["由教师检查容器"],
      confidence: 0.7,
      privacy_visibility: "teacher_only",
      privacy_risk: false,
    });

    await expect(
      readAiChatResponse(
        new Response(JSON.stringify({ reply: `已完成观察。\n\n\`\`\`agent-result\n${structuredResult}\n\`\`\`` }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).resolves.toMatchObject({
      reply: expect.stringContaining("已完成观察。"),
      agentResult: {
        kind: "vision_observation",
        facts: ["有一杯清水"],
        privacy_visibility: "teacher_only",
      },
    });
  });

  it("preserves attachment status from blocking responses", async () => {
    await expect(
      readAiChatResponse(
        new Response(JSON.stringify({
          reply: "请补充文字描述。",
          provider: "fallback",
          attachment: {
            name: "experiment.png",
            status: "unavailable",
            message: "附件暂未上传",
          },
        }), { headers: { "Content-Type": "application/json" } }),
      ),
    ).resolves.toMatchObject({
      attachment: {
        name: "experiment.png",
        status: "unavailable",
        message: "附件暂未上传",
      },
    });
  });

  it("preserves attachment status from streaming meta and done events", async () => {
    const response = new Response(
      'data: {"type":"meta","attachment":{"name":"experiment.png","status":"unavailable","message":"附件暂未上传"}}\n\n' +
      'data: {"type":"done","provider":"fallback","reply":"请补充文字描述。","attachment":{"name":"experiment.png","status":"unavailable","message":"附件暂未上传"}}\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );

    await expect(readAiChatResponse(response)).resolves.toMatchObject({
      attachment: {
        name: "experiment.png",
        status: "unavailable",
        message: "附件暂未上传",
      },
    });
  });
});
