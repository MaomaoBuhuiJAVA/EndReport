import { beforeEach, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
vi.mock("@/lib/auth", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
const phone = "13900000000";
const password = "GardenPassword123";
const request = (body: unknown) => new Request("https://guokeey.cn/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const consent = { acceptedPolicies: true };
beforeEach(() => {vi.resetAllMocks(); vi.mocked(prisma.user.update).mockResolvedValue({} as never);});
it("logs in the existing administrator using phone and does not expose email or password hash", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "admin", name: "园方", phone, email: "admin@gk2y.local", passwordHash: await bcrypt.hash(password, 4), role: "ADMIN", accountType: null, identityVerified: false } as never);
  const result = await POST(request({ phone, password, ...consent }));
  expect(result.status).toBe(200);
  expect(prisma.user.update).toHaveBeenCalledWith({where: {id: "admin"}, data: expect.objectContaining({lastLoginMethod: "password"})});
  expect(await result.json()).toEqual({ user: { id: "admin", name: "园方", phone, role: "ADMIN", accountType: null, identityVerified: false } });
});
it.each([null, [], { phone: [] }, { phone: "not-phone", password, ...consent }, { email: "admin@gk2y.local", password, ...consent }, { phone, password: {} }])("rejects invalid input and email login", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
it("denies an unknown phone", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  expect((await POST(request({ phone, password, ...consent }))).status).toBe(401);
});
it("requires policy consent before checking credentials", async () => {
  expect((await POST(request({ phone, password }))).status).toBe(400);
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
});
it("does not expose a database error", async () => {
  vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("secret"));
  const result = await POST(request({ phone, password, ...consent }));
  expect(result.status).toBe(503);
  expect(JSON.stringify(await result.json())).not.toContain("secret");
});
it("denies a wrong password", async () => {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: await bcrypt.hash(password, 4) } as never);
  expect((await POST(request({ phone, password: "incorrect", ...consent }))).status).toBe(401);
});
it("rejects cross-site login", async () => {
  const req = request({ phone, password, ...consent });
  req.headers.set("origin", "https://other.example");
  expect((await POST(req)).status).toBe(403);
});
it("handles malformed JSON", async () => {
  expect((await POST(new Request("https://guokeey.cn/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
});
