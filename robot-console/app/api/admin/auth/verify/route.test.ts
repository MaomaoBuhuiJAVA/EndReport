import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("@/lib/auth", () => ({ADMIN_PHONE: "13967719299", createSession: vi.fn(), createAdminSmsSession: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {findUnique: vi.fn(), updateMany: vi.fn()}}}));
vi.mock("@/lib/sms", () => ({verifySms: vi.fn()}));
import {createAdminSmsSession, createSession} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {verifySms} from "@/lib/sms";
import {POST} from "./route";

const admin = {id: "admin", name: "园方", username: "school_admin", phone: "13967719299", email: "internal@example.test", role: "ADMIN", accountType: null, identityVerified: false, phoneVerified: false, sessionVersion: 0};
function request(body: unknown) {return new Request("http://localhost/api/admin/auth/verify", {method: "POST", headers: {"content-type": "application/json", origin: "http://localhost"}, body: JSON.stringify(body)});}

describe("administrator SMS verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(admin as never);
    vi.mocked(prisma.user.updateMany).mockResolvedValue({count: 1} as never);
    vi.mocked(verifySms).mockResolvedValue(undefined);
  });

  it("only verifies the fixed administrator phone and issues a short admin session", async () => {
    const response = await POST(request({phone: "13967719299", challengeId: "challenge", code: "123456"}));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(verifySms).toHaveBeenCalledWith([{phone: "13967719299", challengeId: "challenge", code: "123456", purpose: "admin"}]);
    expect(createAdminSmsSession).toHaveBeenCalledWith("admin");
    expect(createSession).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("email");
  });

  it("does not grant access when the fixed phone is not an administrator", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({...admin, role: "USER"} as never);
    expect((await POST(request({phone: "13967719299", challengeId: "challenge", code: "123456"}))).status).toBe(403);
    expect(createAdminSmsSession).not.toHaveBeenCalled();
  });

  it("rejects attempts to verify a different phone before consuming a code", async () => {
    expect((await POST(request({phone: "13800138000", challengeId: "challenge", code: "123456"}))).status).toBe(403);
    expect(verifySms).not.toHaveBeenCalled();
  });
});
