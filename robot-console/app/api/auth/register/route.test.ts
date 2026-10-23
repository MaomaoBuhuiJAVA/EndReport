import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
vi.mock("@/lib/auth", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() } } }));
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
vi.mock("@/lib/sms", () => ({getSmsStatus: vi.fn(() => ({available: true})), verifySms: vi.fn()}));
import {getSmsStatus, verifySms} from "@/lib/sms";

const valid = { name: "小小探索者", phone: "13800138000", accountType: "PARENT", password: "HelloGarden123!" };
function request(body: unknown = valid, headers: Record<string, string> = {}) {
  return new Request("https://guokeey.cn/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
describe("ordinary account registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSmsStatus).mockReturnValue({available: false, registrationVerificationRequired: false} as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.user.create).mockImplementation((async ({ data }: Prisma.UserCreateArgs) => ({ id: "new-user", name: data.name, phone: data.phone, accountType: data.accountType, identityVerified: data.identityVerified, role: data.role })) as never);
  });
  it("registers with a password without SMS proof when SMS is available", async () => {
    vi.mocked(getSmsStatus).mockReturnValue({available: true, registrationVerificationRequired: true} as never);
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(verifySms).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data.phoneVerified).toBe(false);
  });
  it("ignores submitted phone verification flags and unused SMS proofs", async () => {
    vi.mocked(getSmsStatus).mockReturnValue({available: true, registrationVerificationRequired: true} as never);
    expect((await POST(request({...valid, phoneVerified: true, challengeId: "challenge-id", code: "123456"}))).status).toBe(201);
    expect(verifySms).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data.phoneVerified).toBe(false);
  });
  it("allows password registration while SMS is unavailable", async () => {
    vi.mocked(getSmsStatus).mockReturnValue({available: false, registrationVerificationRequired: true} as never);
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(createSession).toHaveBeenCalled();
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data.phoneVerified).toBe(false);
  });
  it("creates an ordinary user even in an empty database and ignores submitted admin role", async () => {
    const response = await POST(request({ ...valid, role: "ADMIN" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ registered: true, user: { id: "new-user", name: valid.name, phone: valid.phone, accountType: "PARENT", identityVerified: false, role: "USER" } });
    expect(prisma.user.count).not.toHaveBeenCalled();
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data;
    expect(data.role).toBe("USER");
    expect(await bcrypt.compare(valid.password, data.passwordHash as string)).toBe(true);
    expect(createSession).toHaveBeenCalledWith({ id: "new-user", name: valid.name, phone: valid.phone, accountType: "PARENT", identityVerified: false, role: "USER" });
  });
  it("trims phone and the public nickname", async () => {
    const response = await POST(request({ ...valid, name: " 探索者 ", phone: " 13800138000 " }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ user: { name: "探索者", phone: valid.phone } });
  });
  it("registers an optional unique username independently of the display name", async () => {
    expect((await POST(request({...valid,username:" TEACHER_ONE "}))).status).toBe(201);
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toMatchObject({username:"teacher_one",name:valid.name,phone:valid.phone});
  });
  it("rejects invalid or duplicate usernames before consuming an SMS proof", async () => {
    expect((await POST(request({...valid,username:valid.phone}))).status).toBe(400);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce({id:"other"} as never);
    expect((await POST(request({...valid,username:"teacher_one"}))).status).toBe(409);
    expect(verifySms).not.toHaveBeenCalled();expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it.each([null, [], { ...valid, name: 123 }, { ...valid, phone: [] }, { ...valid, password: {} }, { ...valid, name: " " }, { ...valid, name: "字".repeat(51) }, { ...valid, phone: "123" }, { ...valid, phone: "12800138000" }, { ...valid, accountType: "ADMIN" }, { ...valid, password: "1234567" }, { ...valid, password: "🌼".repeat(20) }])("rejects invalid account input before accessing the database", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("handles malformed JSON without an internal error", async () => {
    const response = await POST(new Request("https://guokeey.cn/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }));
    expect(response.status).toBe(400);
  });
  it("bounds registration body size", async () => {
    expect((await POST(request({ ...valid, extra: "x".repeat(5000) }))).status).toBe(413);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it("rejects cross-site registration and unsupported content types", async () => {
    expect((await POST(request(valid, { Origin: "https://other.example" }))).status).toBe(403);
    expect((await POST(request(valid, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it("accepts the same public origin behind the HTTPS reverse proxy", async () => {
    const response = await POST(new Request("http://127.0.0.1:3000/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://guokeey.cn", Host: "guokeey.cn", "X-Forwarded-Proto": "https" }, body: JSON.stringify(valid) }));
    expect(response.status).toBe(201);
  });
  it("returns a helpful duplicate-email response", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never);
    expect((await POST(request())).status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it("handles a concurrent duplicate detected by the database", async () => {
    vi.mocked(prisma.user.create).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate email", { code: "P2002", clientVersion: "6.19.3" }));
    expect((await POST(request())).status).toBe(409);
    expect(createSession).not.toHaveBeenCalled();
  });
  it("hides database details on service failure", async () => {
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("database password must not leak"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("password");
  });
  it("reports an already-created account accurately if automatic sign-in fails", async () => {
    vi.mocked(createSession).mockRejectedValue(new Error("cookie unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ registered: true, requiresLogin: true });
  });
  it.each([undefined, "wrong", "GUOKEEY", 123])("rejects teacher registration with an invalid invitation code", async (teacherCode) => {
    expect((await POST(request({ ...valid, accountType: "TEACHER", teacherCode }))).status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it("registers a teacher with the correct code without granting administration", async () => {
    const response = await POST(request({ ...valid, accountType: "TEACHER", teacherCode: "guokeey", role: "ADMIN" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ user: { accountType: "TEACHER", identityVerified: true, role: "USER" } });
  });
  it("ignores parent self-verification and teacher code", async () => {
    const response = await POST(request({ ...valid, identityVerified: true, teacherCode: "guokeey" }));
    expect(await response.json()).toMatchObject({ user: { accountType: "PARENT", identityVerified: false } });
  });
});
