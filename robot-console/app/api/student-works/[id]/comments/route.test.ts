import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentWork: { findUnique: vi.fn() },
    studentWorkComment: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("student work comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue({ id: "teacher-1", email: "t@example.com", name: "教师", role: "ADMIN" });
    vi.mocked(prisma.studentWork.findUnique).mockResolvedValue({ id: "work-1", status: "APPROVED", visibility: "PUBLIC", ownerId: "student-1" } as never);
    vi.mocked(prisma.studentWorkComment.create).mockResolvedValue({ id: "comment-1", body: "观察得很仔细", createdAt: new Date("2026-08-19T00:00:00Z") } as never);
  });

  it("adds a comment to an approved work", async () => {
    const response = await POST(new Request("http://localhost/api/student-works/work-1/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "观察得很仔细" }) }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(201);
    expect(prisma.studentWorkComment.create).toHaveBeenCalledWith(expect.objectContaining({ data: { workId: "work-1", authorId: "teacher-1", body: "观察得很仔细" } }));
  });

  it("returns a generic 503 when comments cannot be saved", async () => {
    vi.mocked(prisma.studentWorkComment.create).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await POST(new Request("http://localhost/api/student-works/work-1/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "观察得很仔细" }) }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "评论服务暂时不可用，请稍后重试" });
  });
});
