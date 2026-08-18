import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      create: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";

const responseId = "2b7aec24-b5d5-4e53-8d29-ddf98c8421a9";

function feedbackRequest(payload: unknown) {
  return new Request("http://localhost/api/ai-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/ai-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records an adopted assistant response as an agent-feedback conversation", async () => {
    vi.mocked(prisma.conversation.create).mockResolvedValue({ id: "feedback-1" } as never);

    const response = await POST(feedbackRequest({
      responseId,
      rating: "adopted",
      userId: "web-teacher-1",
      kind: "lesson_plan",
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ recorded: true });
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);

    const createArg = vi.mocked(prisma.conversation.create).mock.calls[0]?.[0] as {
      data: { speaker: string; scene: string; message: string; reply: string };
    };
    expect(createArg.data).toMatchObject({
      speaker: "web-teacher-1",
      scene: "agent-feedback",
      reply: "adopted",
    });
    expect(JSON.parse(createArg.data.message)).toEqual({
      responseId,
      rating: "adopted",
      userId: "web-teacher-1",
      kind: "lesson_plan",
    });
  });

  it("rejects an unsupported rating without writing a conversation", async () => {
    const response = await POST(feedbackRequest({ responseId, rating: "great" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers and kinds without writing a conversation", async () => {
    const response = await POST(feedbackRequest({
      responseId: "not-a-response-id",
      rating: "needs_revision",
      userId: "teacher with spaces",
      kind: "x".repeat(81),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it("returns a generic server error when persistence fails", async () => {
    vi.mocked(prisma.conversation.create).mockRejectedValue(new Error("database unavailable"));

    const response = await POST(feedbackRequest({ responseId, rating: "not_helpful" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "反馈暂时无法记录" });
  });
});
