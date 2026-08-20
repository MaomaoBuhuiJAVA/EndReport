import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentWork: { findUnique: vi.fn() },
    studentWorkLike: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("student work likes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue({ id: "teacher-1", email: "t@example.com", name: "教师", role: "ADMIN" });
    vi.mocked(prisma.studentWork.findUnique).mockResolvedValue({ id: "work-1", status: "APPROVED", visibility: "PUBLIC", ownerId: "student-1" } as never);
    vi.mocked(prisma.studentWorkLike.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.studentWorkLike.create).mockResolvedValue({ id: "like-1" } as never);
    vi.mocked(prisma.studentWorkLike.count).mockResolvedValue(1);
  });

  it("toggles a like and returns the current count", async () => {
    const response = await POST(new Request("http://localhost/api/student-works/work-1/like", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ liked: true, count: 1 });
    expect(prisma.studentWorkLike.create).toHaveBeenCalledWith({ data: { workId: "work-1", userId: "teacher-1" } });
  });

  it("returns a generic 503 when likes cannot be counted", async () => {
    vi.mocked(prisma.studentWorkLike.count).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await POST(new Request("http://localhost/api/student-works/work-1/like", { method: "POST" }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "点赞服务暂时不可用，请稍后重试" });
  });
});
