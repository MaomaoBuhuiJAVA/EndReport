import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getFreshSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { studentWork: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() } } }));
import { getFreshSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";
const admin = { id: "admin", name: "审核员", email: "admin@example.test", role: "ADMIN" as const };
function request(query = "") { return new Request("http://localhost/api/admin/reviews" + query); }
describe("review queue access and listing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFreshSessionUser).mockResolvedValue(admin);
    vi.mocked(prisma.studentWork.findMany).mockResolvedValue([]);
    vi.mocked(prisma.studentWork.count).mockResolvedValue(0);
    vi.mocked(prisma.studentWork.groupBy).mockResolvedValue([]);
  });
  it("denies a visitor before reading private submissions", async () => {
    vi.mocked(getFreshSessionUser).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(prisma.studentWork.findMany).not.toHaveBeenCalled();
  });
  it("checks current database role, denying ordinary members", async () => {
    vi.mocked(getFreshSessionUser).mockResolvedValue({ ...admin, role: "USER" });
    expect((await GET(request())).status).toBe(403);
    expect(prisma.studentWork.findMany).not.toHaveBeenCalled();
  });
  it("filters status, searches and paginates without exposing account credentials", async () => {
    const response = await GET(request("?status=REJECTED&q=纸桥&page=2"));
    expect(response.status).toBe(200);
    expect(prisma.studentWork.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "REJECTED", OR: expect.any(Array) }), skip: 12, take: 12,
      select: expect.objectContaining({ owner: { select: { name: true } } }),
    }));
    expect(await response.json()).toMatchObject({ total: 0, page: 2, pageSize: 12, counts: { PENDING: 0, APPROVED: 0, REJECTED: 0 } });
  });
  it("returns database counts across status tabs", async () => {
    vi.mocked(prisma.studentWork.groupBy).mockResolvedValue([{ status: "PENDING", _count: { _all: 7 } }, { status: "APPROVED", _count: { _all: 15 } }] as never);
    expect(await (await GET(request())).json()).toMatchObject({ counts: { PENDING: 7, APPROVED: 15, REJECTED: 0 } });
  });
  it.each(["?status=INVALID", "?page=0", "?page=1.5", "?page=abc"])("rejects invalid filter %s", async (query) => {
    expect((await GET(request(query))).status).toBe(400);
    expect(prisma.studentWork.findMany).not.toHaveBeenCalled();
  });
  it("shows database failure as unavailable, never as an empty queue", async () => {
    vi.mocked(prisma.studentWork.findMany).mockRejectedValue(new Error("database disconnected"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "审核列表暂时无法加载，请稍后重试" });
  });
});
