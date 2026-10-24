import {Prisma} from "@prisma/client";
import {authError, authReply, AuthRequestError, readAuthJson} from "@/lib/auth-request";
import {getSessionUser, createSession} from "@/lib/auth";
import {normalizeUsername} from "@/lib/username";
import {prisma} from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    const session = await getSessionUser();
    if (!session) throw new AuthRequestError("请先登录后设置用户名。", 401);
    const username = normalizeUsername(body.username);
    if (!username) throw new AuthRequestError("用户名需为 2 至 24 位中文、字母、数字或下划线，以中文或字母开头。");
    const user = await prisma.user.findUnique({where: {id: session.id}});
    if (!user || user.sessionVersion !== session.sessionVersion) throw new AuthRequestError("账号已更新，请重新登录后再试。", 401);
    const existing = await prisma.user.findUnique({where: {username}, select: {id: true}});
    if (existing && existing.id !== user.id) throw new AuthRequestError("该用户名已被使用，请换一个。", 409);
    const updated = await prisma.user.updateMany({where: {id: user.id, sessionVersion: user.sessionVersion}, data: {username, sessionVersion: {increment: 1}}});
    if (updated.count !== 1) throw new AuthRequestError("账号已更新，请重新登录后再试。", 409);
    const publicUser = {id: user.id, name: user.name, username, phone: user.phone, role: user.role, accountType: user.accountType, identityVerified: user.identityVerified};
    try {await createSession({...publicUser, sessionVersion: user.sessionVersion + 1});}
    catch {return authReply({ok: true, requiresLogin: true});}
    return authReply({ok: true, user: publicUser});
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return authReply({error: "该用户名已被使用，请换一个。"}, 409);
    return authError(error);
  }
}
