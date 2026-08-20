import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { studentWork: { findUnique: vi.fn() } },
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("student work detail availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue(null);
  });

  it("does not expose an unreviewed work to an anonymous request", async () => {
    vi.mocked(prisma.studentWork.findUnique).mockResolvedValue({ id: "work-1", ownerId: "student-1", status: "PENDING", visibility: "TEACHER_ONLY" } as never);

    const response = await GET(new Request("http://localhost/api/student-works/work-1"), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(404);
  });

  it("returns a generic 503 when detail persistence is unavailable", async () => {
    vi.mocked(prisma.studentWork.findUnique).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await GET(new Request("http://localhost/api/student-works/work-1"), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "作品暂时无法查看，请稍后重试" });
  });
});
