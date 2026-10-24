import {beforeEach, expect, it, vi} from "vitest";
vi.mock("next/headers", () => ({cookies: vi.fn()}));
vi.mock("@/lib/prisma", () => ({prisma: {user: {findUnique: vi.fn()}}}));
import {cookies} from "next/headers";
import {prisma} from "@/lib/prisma";
import {createAdminSmsSession, createSession, getAdminSmsSession, getSessionUser} from "./auth";
let token: string;
let adminToken: string;
const user = {id: "u1", name: "家长", role: "USER" as const, phone: "13900000000", accountType: "PARENT" as const, identityVerified: false};
beforeEach(() => {
  vi.resetAllMocks(); token = ""; adminToken = "";
  vi.mocked(cookies).mockResolvedValue({get: (key: string) => {const value = key === "gk_admin_session" ? adminToken : token; return value ? {value} : undefined;}, set: (key: string, value: string, options: unknown) => {if (key === "gk_admin_session") {adminToken = value; expect(options).toMatchObject({httpOnly: true, sameSite: "strict", path: "/", maxAge: 900});} else token = value;}, delete: (key: string) => {if (key === "gk_admin_session") adminToken = "";}} as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({...user, sessionVersion: 0} as never);
});
it("requires a fresh SMS session and rechecks the fixed phone and admin role", async () => {
  expect(await getAdminSmsSession()).toBeNull();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({id: "admin", name: "园方", phone: "13967719299", role: "ADMIN"} as never);
  await createAdminSmsSession("admin");
  expect(await getAdminSmsSession()).toMatchObject({id: "admin", role: "ADMIN", phone: "13967719299"});
  vi.mocked(prisma.user.findUnique).mockResolvedValue({id: "admin", name: "园方", phone: "13967719299", role: "USER"} as never);
  expect(await getAdminSmsSession()).toBeNull();
  vi.mocked(prisma.user.findUnique).mockResolvedValue({id: "admin", name: "园方", phone: "13800138000", role: "ADMIN"} as never);
  expect(await getAdminSmsSession()).toBeNull();
});
it("invalidates existing cookies after the stored credential version changes", async () => {
  await createSession(user);
  expect(await getSessionUser()).toMatchObject(user);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({...user, sessionVersion: 1} as never);
  expect(await getSessionUser()).toBeNull();
});
it("rejects deleted accounts and refuses authentication when the database cannot confirm the session", async () => {
  await createSession(user);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  expect(await getSessionUser()).toBeNull();
  vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("database unavailable"));
  expect(await getSessionUser()).toBeNull();
});
