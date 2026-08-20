import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentWork: { findUnique: vi.fn() },
    studentGrowthRecord: { create: vi.fn() },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("student work growth records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue({ id: "student-1", email: "s@example.com", name: "小朋友", role: "USER" });
    vi.mocked(prisma.studentWork.findUnique).mockResolvedValue({ id: "work-1", ownerId: "student-1" } as never);
    vi.mocked(prisma.studentGrowthRecord.create).mockResolvedValue({ id: "growth-1", stage: "反思", note: "下次换更厚的纸", createdAt: new Date("2026-08-19T00:00:00Z") } as never);
  });

  it("stores an owner reflection in the growth archive", async () => {
    const response = await POST(new Request("http://localhost/api/student-works/work-1/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "反思", note: "下次换更厚的纸" }) }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(201);
    expect(prisma.studentGrowthRecord.create).toHaveBeenCalledWith({ data: { workId: "work-1", authorId: "student-1", stage: "反思", note: "下次换更厚的纸" } });
  });

  it("returns a generic 503 when growth records cannot be saved", async () => {
    vi.mocked(prisma.studentGrowthRecord.create).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await POST(new Request("http://localhost/api/student-works/work-1/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "反思", note: "下次换更厚的纸" }) }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "成长档案服务暂时不可用，请稍后重试" });
  });
});
