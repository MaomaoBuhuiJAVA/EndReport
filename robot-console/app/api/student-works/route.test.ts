import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
  getFreshSessionUser: vi.fn(),
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

vi.mock("@/lib/oss-upload", () => ({ persistOssUpload: vi.fn() }));

import { getFreshSessionUser, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { persistOssUpload } from "@/lib/oss-upload";
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
    vi.mocked(getFreshSessionUser).mockResolvedValue({ ...student, role: "ADMIN" });
  });

  it("keeps an authorized administrator submission pending and internal until review", async () => {
    vi.mocked(persistOssUpload).mockResolvedValue({ url: "/api/media/uploads/student-works/student-1/work.png" } as never);
    vi.mocked(prisma.studentWork.create).mockResolvedValue({
      id: "work-1",
      title: "纸片桥",
      description: "观察承重变化",
      mediaUrl: "/api/media/uploads/student-works/student-1/work.png",
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
    expect(persistOssUpload).toHaveBeenCalledWith(expect.any(File), {folder: `student-works/${student.id}`, maxBytes: 20 * 1024 * 1024});
    expect(prisma.studentWork.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ownerId: student.id,
        status: "PENDING",
        visibility: "TEACHER_ONLY",
        mediaUrl: "/api/media/uploads/student-works/student-1/work.png",
      }),
    }));
  });

  it("denies anonymous submissions before reading or storing the upload", async () => {
    vi.mocked(getFreshSessionUser).mockResolvedValue(null);
    expect((await POST(uploadRequest({ title: "作品" }))).status).toBe(401);
    expect(persistOssUpload).not.toHaveBeenCalled();
    expect(prisma.studentWork.create).not.toHaveBeenCalled();
  });

  it("denies new ordinary accounts without verified submission permission", async () => {
    vi.mocked(getFreshSessionUser).mockResolvedValue(student);
    expect((await POST(uploadRequest({ title: "作品" }))).status).toBe(403);
    expect(persistOssUpload).not.toHaveBeenCalled();
    expect(prisma.studentWork.create).not.toHaveBeenCalled();
  });

  it("fails closed if the current database permission cannot be checked", async () => {
    vi.mocked(getFreshSessionUser).mockRejectedValue(new Error("database disconnected"));
    expect((await POST(uploadRequest({ title: "作品" }))).status).toBe(503);
    expect(persistOssUpload).not.toHaveBeenCalled();
  });

  it.each(["TEACHER", "PARENT"] as const)("allows verified %s submissions but keeps them pending and internal", async (accountType) => {
    vi.mocked(getFreshSessionUser).mockResolvedValue({ ...student, accountType, identityVerified: true });
    vi.mocked(prisma.studentWork.create).mockResolvedValue({ id: "verified-work", title: "作品", createdAt: new Date() } as never);
    vi.mocked(persistOssUpload).mockResolvedValue({ url: "/api/media/uploads/student-works/student-1/work.png" } as never);
    const response = await POST(uploadRequest({ title: "作品" }, new File(["image"], "work.png", { type: "image/png" })));
    expect(response.status).toBe(201);
    expect(prisma.studentWork.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", visibility: "TEACHER_ONLY", ownerId: student.id }) }));
  });

  it.each(["TEACHER", "PARENT"] as const)("denies unverified %s accounts", async (accountType) => {
    vi.mocked(getFreshSessionUser).mockResolvedValue({ ...student, accountType, identityVerified: false });
    expect((await POST(uploadRequest({ title: "作品" }))).status).toBe(403);
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
    vi.mocked(persistOssUpload).mockResolvedValue({ url: "/api/media/uploads/student-works/student-1/work.png" } as never);
    vi.mocked(prisma.studentWork.create).mockRejectedValue(new Error("P2021 table does not exist"));

    const response = await POST(uploadRequest(
      { title: "纸片桥" },
      new File(["image"], "bridge.png", { type: "image/png" }),
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "作品暂时无法保存，请稍后重试" });
  });
});
