import {beforeEach, describe, expect, it, vi} from "vitest";
vi.mock("@/lib/auth", () => ({getSessionUser: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {updateMany: vi.fn()}}}));
import {getSessionUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {PATCH} from "./route";
const user = {id: "u1", name: "家长", role: "USER" as const, sessionVersion: 0};
const request = (body: unknown, origin = "https://guokeey.cn") => new Request("https://guokeey.cn/api/auth/profile", {method: "PATCH", headers: {"Content-Type": "application/json", Origin: origin}, body: JSON.stringify(body)});
beforeEach(() => {vi.resetAllMocks(); vi.mocked(getSessionUser).mockResolvedValue(user); vi.mocked(prisma.user.updateMany).mockResolvedValue({count: 1});});
describe("account profile edits", () => {
  it("requires an authenticated account", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await PATCH(request({name: "小贝"}))).status).toBe(401);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("updates only the current account's name and selected avatar", async () => {
    const response = await PATCH(request({name: " 小贝 ", avatarKey: "sprout", id: "other", role: "ADMIN"}));
    expect(response.status).toBe(200);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({where: {id: "u1", sessionVersion: 0}, data: {name: "小贝", avatarKey: "sprout", avatarImage: null}});
    expect(await response.json()).toMatchObject({user: {id: "u1", name: "小贝", role: "USER", avatarKey: "sprout"}});
  });
  it("rejects empty names, control characters, and unapproved avatars without writing", async () => {
    for (const body of [{name: "  "}, {name: "a\nADMIN"}, {name: "a".repeat(51)}, {avatarKey: "https://foreign.invalid/image.svg"}, {}]) expect((await PATCH(request(body))).status).toBe(400);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests", async () => {
    expect((await PATCH(request({name: "小贝"}, "https://foreign.invalid"))).status).toBe(403);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("does not apply a stale account session", async () => {
    vi.mocked(prisma.user.updateMany).mockResolvedValue({count: 0});
    expect((await PATCH(request({name: "小贝"}))).status).toBe(409);
  });
});
