import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentWork: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    knowledgeDocument: {
      create: vi.fn(),
    },
  },
}));

import { getSessionUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

const teacher = { id: "teacher-1", email: "teacher@example.com", name: "教师", role: "ADMIN" as const };

function request(body: unknown) {
  return new Request("http://localhost/api/student-works/work-1/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("student work review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue(teacher);
    vi.mocked(requireAdmin).mockResolvedValue(teacher);
    vi.mocked(prisma.studentWork.findUnique).mockResolvedValue({
      id: "work-1",
      title: "纸片桥",
      description: "观察承重变化",
      mediaUrl: "https://blob.example/work.png",
      mimeType: "image/png",
      ownerId: "student-1",
      status: "PENDING",
      visibility: "TEACHER_ONLY",
      libraryDocumentId: null,
    } as never);
    vi.mocked(prisma.studentWork.update).mockResolvedValue({ id: "work-1", status: "APPROVED", visibility: "PUBLIC" } as never);
  });

  it("publishes only after teacher approval and can explicitly ingest into the library", async () => {
    vi.mocked(prisma.knowledgeDocument.create).mockResolvedValue({ id: "doc-1", title: "纸片桥" } as never);

    const response = await POST(request({ action: "approve", visibility: "public", addToLibrary: true, reviewNote: "材料清楚" }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(200);
    expect(prisma.studentWork.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "work-1" },
      data: expect.objectContaining({ status: "APPROVED", visibility: "PUBLIC", reviewedBy: teacher.id, libraryDocumentId: "doc-1" }),
    }));
    expect(prisma.knowledgeDocument.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "纸片桥", sourcePath: "student-work:work-1" }) }));
  });

  it("rejects non-teachers and never changes the work", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    vi.mocked(getSessionUser).mockResolvedValue({ ...teacher, role: "USER" });
    const response = await POST(request({ action: "approve" }), { params: Promise.resolve({ id: "work-1" }) });
    expect(response.status).toBe(403);
    expect(prisma.studentWork.update).not.toHaveBeenCalled();
  });

  it("returns a generic 503 when the works table is unavailable", async () => {
    vi.mocked(prisma.studentWork.findUnique).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await POST(request({ action: "approve" }), { params: Promise.resolve({ id: "work-1" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "审核服务暂时不可用，请稍后重试" });
  });
});
