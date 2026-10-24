import bcrypt from "bcryptjs";
import {Prisma} from "@prisma/client";
import {authError, authPhone, authReply, readAuthJson, smsProof, AuthRequestError} from "@/lib/auth-request";
import {createSession, getSessionUser} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {verifySms} from "@/lib/sms";
export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request); const session = await getSessionUser();
    if (!session) throw new AuthRequestError("请先登录后修改手机号。", 401);
    const phone = authPhone(body.phone);
    const user = await prisma.user.findUnique({where: {id: session.id}});
    if (!user) throw new AuthRequestError("账号已失效，请重新登录。", 401);
    if (phone === user.phone) throw new AuthRequestError("新手机号需与当前绑定的号码不同。");
    if (await prisma.user.findUnique({where: {phone}, select: {id: true}})) throw new AuthRequestError("该手机号已绑定其他账号。", 409);
    const proof = smsProof(body, phone, "phone_new", user.id);
    if (user.phone) {
      const currentProof = smsProof({challengeId: body.currentChallengeId, code: body.currentCode}, user.phone, "phone_current", user.id);
      await verifySms([currentProof, proof]);
    } else {
      if (typeof body.oldPassword !== "string" || !await bcrypt.compare(body.oldPassword, user.passwordHash)) throw new AuthRequestError("请填写正确的账号密码以绑定手机号。", 401);
      await verifySms([proof]);
    }
    // Bind to the fresh current number/version so a concurrent account change cannot be overwritten.
    const updated = await prisma.user.updateMany({where: {id: user.id, phone: user.phone, sessionVersion: user.sessionVersion}, data: {phone,
      ...(user.email === `${user.phone}@accounts.local.invalid` ? {email: `${phone}@accounts.local.invalid`} : {}), phoneVerified: true, sessionVersion: {increment: 1}}});
    if (updated.count !== 1) throw new AuthRequestError("账号已更新，请刷新后重试。", 409);
    const publicUser = {id: user.id, name: user.name, username: user.username, phone, role: user.role, accountType: user.accountType, identityVerified: user.identityVerified};
    try {await createSession({...publicUser, sessionVersion: user.sessionVersion + 1});}
    catch {return authReply({ok: true, requiresLogin: true});}
    return authReply({ok: true, user: publicUser});
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return authReply({error: "该手机号已绑定其他账号。"}, 409);
    return authError(error);
  }
}
