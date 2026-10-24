import {beforeEach, describe, expect, it, vi} from "vitest";
import sharp from "sharp";
vi.mock("@/lib/auth", () => ({getSessionUser: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {updateMany: vi.fn(), findUnique: vi.fn()}}}));
import {getSessionUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {GET, POST} from "./route";
const user = {id: "u1", name: "家长", role: "USER" as const, sessionVersion: 0};
function request(file: File, origin = "https://guokeey.cn") {
  const body = new FormData(); body.set("avatar", file);
  return new Request("https://guokeey.cn/api/auth/avatar", {method: "POST", headers: {Origin: origin}, body});
}
beforeEach(() => {vi.resetAllMocks(); vi.mocked(getSessionUser).mockResolvedValue(user); vi.mocked(prisma.user.updateMany).mockResolvedValue({count: 1});});
describe("account avatar uploads", () => {
  it("requires a session for uploads and reads", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect((await POST(request(new File(["test"], "avatar.png", {type: "image/png"})))).status).toBe(401);
    expect((await GET()).status).toBe(401);
    expect(prisma.user.updateMany).not.toHaveBeenCalled(); expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("rejects cross-site uploads", async () => {
    expect((await POST(request(new File(["test"], "avatar.png", {type: "image/png"}), "https://foreign.invalid"))).status).toBe(403);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects disguised SVG and oversized requests without writing", async () => {
    expect((await POST(request(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], "avatar.png", {type: "image/png"})))).status).toBe(400);
    const large = request(new File(["x"], "avatar.png", {type: "image/png"})); large.headers.set("Content-Length", String(4 * 1024 * 1024));
    expect((await POST(large)).status).toBe(413);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it("normalizes uploaded images and stores them only for the authenticated account", async () => {
    const jpeg = await sharp({create: {width: 400, height: 300, channels: 3, background: "#176b5d"}}).jpeg().toBuffer();
    const response = await POST(request(new File([new Uint8Array(jpeg)], "portrait.jpg", {type: "image/jpeg"})));
    expect(response.status).toBe(200);
    const args = vi.mocked(prisma.user.updateMany).mock.calls[0][0];
    expect(args.where).toEqual({id: "u1", sessionVersion: 0});
    expect(args.data.avatarKey).toMatch(/^upload_/u);
    const avatar = args.data.avatarImage as Uint8Array;
    expect((await sharp(avatar).metadata())).toMatchObject({format: "webp", width: 192, height: 192});
    expect(avatar.length).toBeLessThanOrEqual(65536);
    expect(JSON.stringify(await response.json())).not.toContain("avatarImage");
  });
  it("reads only the caller's image and prevents shared cache reuse", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({avatarImage: new Uint8Array([1, 2, 3])} as never);
    const response = await GET();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where: {id: "u1"}, select: {avatarImage: true}});
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});
