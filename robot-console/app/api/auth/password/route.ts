import bcrypt from "bcryptjs";
import { createSession, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {authError, authPassword, authReply, readAuthJson, AuthRequestError} from "@/lib/auth-request";

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request); const session = await getSessionUser();
    if (!session) throw new AuthRequestError("请先登录。", 401);
    const password = authPassword(body.newPassword);
    if (typeof body.oldPassword !== "string" || !body.oldPassword || Buffer.byteLength(body.oldPassword, "utf8") > 128) throw new AuthRequestError("请输入原密码。");
    const user = await prisma.user.findUnique({where: {id: session.id}});
    if (!user || !await bcrypt.compare(body.oldPassword, user.passwordHash)) throw new AuthRequestError("原密码不正确。", 401);
    if (body.oldPassword === password) throw new AuthRequestError("新密码需要与原密码不同。");
    const updated = await prisma.user.updateMany({where: {id: user.id, sessionVersion: user.sessionVersion}, data: {passwordHash: await bcrypt.hash(password, 12), sessionVersion: {increment: 1}}});
    if (updated.count !== 1) throw new AuthRequestError("账号已更新，请重新登录。", 409);
    try {await createSession({...session, sessionVersion: user.sessionVersion + 1});}
    catch {return authReply({ok: true, requiresLogin: true});}
    return authReply({ok: true});
  } catch (error) {return authError(error);}
}
