import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
  getPublicActor: vi.fn().mockResolvedValue({ id: "public-participant", email: "public@example.com", name: "参与者", role: "USER" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studentWork: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { GET, POST } from "./route";

const student = { id: "student-1", email: "student@example.com", name: "小朋友", role: "USER" as const };

function uploadRequest(fields: Record<string, string>, file?: File) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  if (file) form.set("file", file);
  return new Request("http://localhost/api/student-works", { method: "POST", body: form });
}

describe("student work collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionUser).mockResolvedValue(student);
  });

  it("creates an immediately public work without an account gate", async () => {
    vi.mocked(put).mockResolvedValue({ url: "https://blob.example/work.png" } as never);
    vi.mocked(prisma.studentWork.create).mockResolvedValue({
      id: "work-1",
      title: "纸片桥",
      description: "观察承重变化",
      mediaUrl: "https://blob.example/work.png",
      status: "PENDING",
      visibility: "TEACHER_ONLY",
      ownerId: student.id,
      createdAt: new Date("2026-08-19T00:00:00Z"),
    } as never);

    const response = await POST(uploadRequest(
      { title: "纸片桥", description: "观察承重变化", studentLabel: "大一班" },
      new File(["image"], "bridge.png", { type: "image/png" }),
    ));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ work: { id: "work-1" } });
    expect(put).toHaveBeenCalledWith(expect.stringContaining("student-works/"), expect.any(File), expect.objectContaining({ access: "public", contentType: "image/png" }));
    expect(prisma.studentWork.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerId: student.id,
        status: "APPROVED",
        visibility: "PUBLIC",
        mediaUrl: "https://blob.example/work.png",
      }),
    }));
  });

  it("rejects uploads without a file or title", async () => {
    const response = await POST(uploadRequest({ title: "" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(prisma.studentWork.create).not.toHaveBeenCalled();
  });

  it("only exposes approved public works to an anonymous request", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(prisma.studentWork.findMany).mockResolvedValue([] as never);

    const response = await GET(new Request("http://localhost/api/student-works"));

    expect(response.status).toBe(200);
    expect(prisma.studentWork.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "APPROVED", visibility: "PUBLIC" },
    }));
  });

  it("returns an empty public list while the works table is unavailable", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(prisma.studentWork.findMany).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await GET(new Request("http://localhost/api/student-works"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ works: [] });
  });

  it("returns a generic 503 when persistence fails after upload", async () => {
    vi.mocked(put).mockResolvedValue({ url: "https://blob.example/work.png" } as never);
    vi.mocked(prisma.studentWork.create).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await POST(uploadRequest(
      { title: "纸片桥" },
      new File(["image"], "bridge.png", { type: "image/png" }),
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "作品暂时无法保存，请稍后重试" });
  });
});
