import { beforeEach, describe, expect, it, vi } from "vitest";
const { tx } = vi.hoisted(() => ({ tx: {
  studentWork: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  knowledgeDocument: { create: vi.fn() },
} }));
vi.mock("@/lib/auth", () => ({ getFreshSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: vi.fn() } }));
import { getFreshSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";
const updatedAt = "2026-10-09T10:00:00.000Z";
const admin = { id: "admin", name: "审核员", email: "admin@example.test", role: "ADMIN" as const };
const params = { params: Promise.resolve({ id: "work-1" }) };
function request(body: unknown) { return new Request("http://localhost/api/admin/reviews/work-1", { method: "PATCH", body: JSON.stringify(body) }); }
describe("review decisions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFreshSessionUser).mockResolvedValue(admin);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => (callback as (client: typeof tx) => Promise<unknown>)(tx) as never);
    tx.studentWork.findUnique.mockResolvedValue({ id: "work-1", title: "纸桥", description: "承重观察", mimeType: "image/png", mediaUrl: "/test.png", status: "PENDING", updatedAt: new Date(updatedAt), libraryDocumentId: null });
    tx.studentWork.updateMany.mockResolvedValue({ count: 1 });
    tx.knowledgeDocument.create.mockResolvedValue({ id: "doc-1" });
  });
  it("denies a non-admin without writing", async () => {
    vi.mocked(getFreshSessionUser).mockResolvedValue({ ...admin, role: "USER" });
    expect((await PATCH(request({ action: "approve", expectedUpdatedAt: updatedAt }), params)).status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("defaults approval to internal visibility and records who reviewed", async () => {
    const response = await PATCH(request({ action: "approve", expectedUpdatedAt: updatedAt }), params);
    expect(response.status).toBe(200);
    expect(tx.studentWork.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "work-1", status: "PENDING", updatedAt: new Date(updatedAt) },
      data: expect.objectContaining({ status: "APPROVED", visibility: "TEACHER_ONLY", reviewedBy: "admin" }),
    }));
    expect(tx.knowledgeDocument.create).not.toHaveBeenCalled();
  });
  it("publishes only explicitly and writes optional library content inside the transaction", async () => {
    const response = await PATCH(request({ action: "approve", visibility: "public", addToLibrary: true, expectedUpdatedAt: updatedAt }), params);
    expect(response.status).toBe(200);
    expect(tx.studentWork.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ visibility: "PUBLIC" }) }));
    expect(tx.knowledgeDocument.create).toHaveBeenCalledOnce();
    expect(tx.studentWork.update).toHaveBeenCalledWith({ where: { id: "work-1" }, data: { libraryDocumentId: "doc-1" } });
  });
  it("refuses to copy internal work into the public reference library", async () => {
    const response = await PATCH(request({ action: "approve", visibility: "teacher", addToLibrary: true, expectedUpdatedAt: updatedAt }), params);
    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("requires a rejection reason and keeps rejected work internal", async () => {
    expect((await PATCH(request({ action: "reject", expectedUpdatedAt: updatedAt }), params)).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect((await PATCH(request({ action: "reject", reviewNote: "请补充过程照片", expectedUpdatedAt: updatedAt }), params)).status).toBe(200);
    expect(tx.studentWork.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", visibility: "TEACHER_ONLY", reviewNote: "请补充过程照片" }) }));
  });
  it("refuses an already reviewed submission", async () => {
    tx.studentWork.findUnique.mockResolvedValue({ status: "APPROVED" });
    expect((await PATCH(request({ action: "reject", reviewNote: "修改", expectedUpdatedAt: updatedAt }), params)).status).toBe(409);
    expect(tx.studentWork.updateMany).not.toHaveBeenCalled();
  });
  it("detects concurrent updates before creating any library record", async () => {
    tx.studentWork.updateMany.mockResolvedValue({ count: 0 });
    expect((await PATCH(request({ action: "approve", visibility: "public", addToLibrary: true, expectedUpdatedAt: updatedAt }), params)).status).toBe(409);
    expect(tx.knowledgeDocument.create).not.toHaveBeenCalled();
  });
  it("returns service failure if library import fails", async () => {
    tx.knowledgeDocument.create.mockRejectedValue(new Error("database disconnected"));
    expect((await PATCH(request({ action: "approve", visibility: "public", addToLibrary: true, expectedUpdatedAt: updatedAt }), params)).status).toBe(503);
  });
  it.each([{ action: "delete", expectedUpdatedAt: updatedAt }, { action: "approve" }, { action: "approve", expectedUpdatedAt: "bad-date" }])("rejects malformed decision %j", async (body) => {
    expect((await PATCH(request(body), params)).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
