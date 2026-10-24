import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("@/lib/auth", () => ({getAdminSmsSession: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {findMany: vi.fn(), count: vi.fn()}}}));
import {getAdminSmsSession} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {GET} from "./route";

function request(query = "") {return new Request(`http://localhost/api/admin/users${query}`);}

describe("admin user listing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAdminSmsSession).mockResolvedValue({id: "admin", name: "园方", phone: "13967719299", role: "ADMIN"} as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
  });

  it("requires the SMS-verified admin session before reading accounts", async () => {
    vi.mocked(getAdminSmsSession).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("returns paginated account and latest login details without credential fields", async () => {
    const response = await GET(request("?q=小王&page=2"));
    expect(response.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      orderBy: [{createdAt: "desc"}, {id: "desc"}],
      select: expect.objectContaining({lastLoginAt: true, lastLoginMethod: true}),
    }));
    const payload = await response.json();
    expect(payload).toMatchObject({total: 0, page: 2, pageSize: 20});
    expect(JSON.stringify(payload)).not.toMatch(/passwordHash|password/i);
  });

  it("rejects invalid pagination before querying account data", async () => {
    expect((await GET(request("?page=0"))).status).toBe(400);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
