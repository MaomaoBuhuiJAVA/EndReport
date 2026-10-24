import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("@/lib/auth", () => ({ADMIN_PHONE: "13967719299", createSession: vi.fn(), getSessionUser: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn()}}}));
vi.mock("@/lib/sms", () => ({verifySms: vi.fn(), sendSms: vi.fn(), isSmsPurpose: (value: unknown) => ["login", "register", "reset_password", "phone_current", "phone_new", "admin"].includes(value as string)}));
vi.mock("bcryptjs", () => ({default: {hash: vi.fn(async () => "hashed-new-password"), compare: vi.fn(async () => true)}}));
import bcrypt from "bcryptjs";
import {createSession, getSessionUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {sendSms, verifySms} from "@/lib/sms";
import {SmsError} from "@/lib/sms/service";
import {POST as login} from "./sms/login/route";
import {POST as send} from "./sms/send/route";
import {POST as sendAdminCode} from "../admin/auth/send-code/route";
import {POST as reset} from "./password/reset/route";
import {POST as phone} from "./phone/route";
import {POST as password} from "./password/route";

const user = {id: "u1", name: "家长", phone: "13800138000", email: "13800138000@accounts.local.invalid", passwordHash: "old-hash", accountType: "PARENT" as const, role: "USER" as const, identityVerified: false, sessionVersion: 2};
const proof = {phone: user.phone, challengeId: "11111111-1111-4111-8111-111111111111" as const, code: "123456"};
const newPhone = "13900139000";
const phoneBody = {...proof, phone: newPhone, currentChallengeId: "22222222-2222-4222-8222-222222222222", currentCode: "654321"};
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://guokeey.cn/api/auth/test", {method: "POST", headers: {"Content-Type": "application/json", ...headers}, body: JSON.stringify(body)});
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(user);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
  vi.mocked(prisma.user.updateMany).mockResolvedValue({count: 1});
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  vi.mocked(bcrypt.hash).mockResolvedValue("hashed-new-password" as never);
  vi.mocked(sendSms).mockResolvedValue({challengeId: proof.challengeId, retryAfter: 60, expiresIn: 300});
});
describe("SMS account request boundaries", () => {
  it.each([login, send, reset, phone, password])("rejects foreign origins before verification or account writes", async route => {
    expect((await route(request(proof, {origin: "https://foreign.example"}))).status).toBe(403);
    expect(verifySms).not.toHaveBeenCalled(); expect(sendSms).not.toHaveBeenCalled(); expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and oversized bodies", async () => {
    const malformed = new Request("https://guokeey.cn/api/auth/test", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{"});
    expect((await login(malformed)).status).toBe(400);
    expect((await login(request({padding: "a".repeat(4100)}))).status).toBe(413);
    expect((await login(request(proof, {"Content-Type": "text/plain"}))).status).toBe(415);
    expect(verifySms).not.toHaveBeenCalled();
  });
  it("returns a disabled-service response without accessing user records", async () => {
    vi.mocked(verifySms).mockRejectedValue(new SmsError("短信尚未开通", 503));
    expect((await login(request({...proof, acceptedPolicies: true}))).status).toBe(503);
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); expect(createSession).not.toHaveBeenCalled();
  });
});
describe("SMS sending and login", () => {
  it("does not accept arbitrary template purposes", async () => {
    expect((await send(request({...proof, phone: "13800138000", purpose: "admin"}))).status).toBe(403); expect(sendSms).not.toHaveBeenCalled();
  });
  it("sends administrator verification only to the configured administrator phone", async () => {
    expect((await sendAdminCode(request({phone: "13800138000"}))).status).toBe(403);
    expect(sendSms).not.toHaveBeenCalled();
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({id: "admin", role: "ADMIN"} as never);
    expect((await sendAdminCode(request({phone: "13967719299"}))).status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith("13967719299", "admin", "direct-client");
  });
  it("requires a session and the actual current phone for phone-change SMS", async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);
    expect((await send(request({...proof, purpose: "phone_new"}))).status).toBe(401);
    expect((await send(request({...proof, phone: newPhone, purpose: "phone_current"}))).status).toBe(400);
    expect(sendSms).not.toHaveBeenCalled();
  });
  it("binds phone-change sends to the session user and preserves rate-limit headers", async () => {
    await send(request({...proof, phone: newPhone, purpose: "phone_new"}, {"x-forwarded-for": "192.0.2.1, 10.0.0.1"}));
    expect(sendSms).toHaveBeenCalledWith(newPhone, "phone_new", "192.0.2.1", user.id);
    vi.mocked(sendSms).mockRejectedValueOnce(new SmsError("稍后重试", 429, 60));
    const response = await send(request({...proof, purpose: "login"})); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
  });
  it("logs in an existing user without accepting submitted privileges", async () => {
    const response = await login(request({...proof, acceptedPolicies: true, role: "ADMIN", identityVerified: true}));
    expect(response.status).toBe(200);
    expect(verifySms).toHaveBeenCalledWith([{...proof, purpose: "login"}]);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({where: {id: user.id, phone: user.phone, sessionVersion: 2}, data: expect.objectContaining({lastLoginMethod: "sms"})});
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({role: "USER", identityVerified: false, sessionVersion: 2}));
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("passwordHash");
  });
  it("requires policy consent before verifying an SMS login", async () => {
    expect((await login(request(proof))).status).toBe(400);
    expect(verifySms).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("does not auto-register unknown phones or write accounts after invalid proofs", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    expect((await login(request({...proof, acceptedPolicies: true}))).status).toBe(401); expect(createSession).not.toHaveBeenCalled();
    vi.mocked(verifySms).mockRejectedValueOnce(new SmsError("验证码用途错误"));
    expect((await login(request({...proof, acceptedPolicies: true}))).status).toBe(400); expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("does not verify a changed phone or issue a session after a concurrent account change", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({count: 0});
    expect((await login(request({...proof, acceptedPolicies: true}))).status).toBe(409);
    expect(createSession).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).toHaveBeenCalledWith({where: {id: user.id, phone: user.phone, sessionVersion: 2}, data: expect.objectContaining({phoneVerified: true, lastLoginMethod: "sms"})});
  });
});
describe("password reset and change", () => {
  it("uses a reset-purpose proof, hashes the password and invalidates old sessions", async () => {
    const response = await reset(request({...proof, newPassword: "NewPassword123"}));
    expect(await response.json()).toEqual({ok: true, requiresLogin: true});
    expect(verifySms).toHaveBeenCalledWith([{...proof, purpose: "reset_password"}]);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({where: {id: user.id, phone: user.phone, sessionVersion: 2}, data: {passwordHash: "hashed-new-password", phoneVerified: true, sessionVersion: {increment: 1}}});
    expect(createSession).not.toHaveBeenCalled();
  });
  it("rejects weak passwords, invalid proofs and concurrent resets without further writes", async () => {
    expect((await reset(request({...proof, newPassword: "short"}))).status).toBe(400); expect(verifySms).not.toHaveBeenCalled();
    vi.mocked(verifySms).mockRejectedValueOnce(new SmsError("验证码无效"));
    expect((await reset(request({...proof, newPassword: "NewPassword123"}))).status).toBe(400); expect(prisma.user.updateMany).not.toHaveBeenCalled();
    vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({count: 0});
    expect((await reset(request({...proof, newPassword: "NewPassword123"}))).status).toBe(409);
  });
  it("changes a password only after current-password verification and renews the session version", async () => {
    expect((await password(request({oldPassword: "OldPassword", newPassword: "NewPassword123"}))).status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({sessionVersion: 3}));
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    vi.mocked(prisma.user.updateMany).mockClear();
    expect((await password(request({oldPassword: "wrong", newPassword: "NewPassword123"}))).status).toBe(401); expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("reports a saved password honestly if cookie renewal fails", async () => {
    vi.mocked(createSession).mockRejectedValueOnce(new Error("cookies unavailable"));
    const response = await password(request({oldPassword: "OldPassword", newPassword: "NewPassword123"}));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ok: true, requiresLogin: true});
  });
});
describe("phone binding", () => {
  function binding(account = user) {vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(account as never).mockResolvedValueOnce(null);}
  it("requires login and both proofs for an existing binding", async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);
    expect((await phone(request(phoneBody))).status).toBe(401);
    binding();
    expect((await phone(request({...phoneBody, currentCode: undefined}))).status).toBe(400); expect(verifySms).not.toHaveBeenCalled(); expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("checks both phones against the user, updates derived email and preserves role", async () => {
    binding(); const response = await phone(request({...phoneBody, role: "ADMIN"}));
    expect(response.status).toBe(200);
    expect(verifySms).toHaveBeenCalledWith([{challengeId: phoneBody.currentChallengeId, code: phoneBody.currentCode, phone: user.phone, purpose: "phone_current", principal: user.id}, {...proof, phone: newPhone, purpose: "phone_new", principal: user.id}]);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({where: {id: user.id, phone: user.phone, sessionVersion: 2}, data: {phone: newPhone, email: `${newPhone}@accounts.local.invalid`, phoneVerified: true, sessionVersion: {increment: 1}}});
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({phone: newPhone, role: "USER", identityVerified: false, sessionVersion: 3}));
  });
  it("preserves legacy email identifiers", async () => {
    binding({...user, email: "admin@school.example"}); await phone(request(phoneBody));
    expect(vi.mocked(prisma.user.updateMany).mock.calls[0][0].data).not.toHaveProperty("email");
  });
  it("rejects occupied numbers, invalid proofs and concurrent changes", async () => {
    expect((await phone(request(phoneBody))).status).toBe(409); expect(verifySms).not.toHaveBeenCalled();
    binding(); vi.mocked(verifySms).mockRejectedValueOnce(new SmsError("验证码无效"));
    expect((await phone(request(phoneBody))).status).toBe(400); expect(prisma.user.updateMany).not.toHaveBeenCalled();
    binding(); vi.mocked(prisma.user.updateMany).mockResolvedValueOnce({count: 0});
    expect((await phone(request(phoneBody))).status).toBe(409); expect(createSession).not.toHaveBeenCalled();
  });
  it("uses the existing password plus a new-phone proof for a legacy account without a phone", async () => {
    binding({...user, phone: null} as never); await phone(request({...phoneBody, oldPassword: "OldPassword"}));
    expect(verifySms).toHaveBeenCalledWith([{...proof, phone: newPhone, purpose: "phone_new", principal: user.id}]);
    binding({...user, phone: null} as never); vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never); vi.mocked(verifySms).mockClear();
    expect((await phone(request({...phoneBody, oldPassword: "wrong"}))).status).toBe(401); expect(verifySms).not.toHaveBeenCalled();
  });
  it("reports a saved phone honestly if cookie renewal fails", async () => {
    binding(); vi.mocked(createSession).mockRejectedValueOnce(new Error("cookies unavailable"));
    const response = await phone(request(phoneBody)); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok: true, requiresLogin: true});
  });
});
