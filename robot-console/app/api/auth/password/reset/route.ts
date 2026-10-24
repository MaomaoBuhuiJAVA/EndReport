import bcrypt from "bcryptjs";
import {authError, authPhone, authPassword, authReply, readAuthJson, smsProof} from "@/lib/auth-request";
import {prisma} from "@/lib/prisma";
import {verifySms} from "@/lib/sms";
export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request); const phone = authPhone(body.phone); const password = authPassword(body.newPassword);
    await verifySms([smsProof(body, phone, "reset_password")]);
    const user = await prisma.user.findUnique({where: {phone}, select: {id: true, sessionVersion: true}});
    if (!user) return authReply({error: "该手机号尚未注册，请先创建账号。"}, 400);
    const changed = await prisma.user.updateMany({where: {id: user.id, phone, sessionVersion: user.sessionVersion}, data: {passwordHash: await bcrypt.hash(password, 12), phoneVerified: true, sessionVersion: {increment: 1}}});
    if (changed.count !== 1) return authReply({error: "账号已更新，请重新获取验证码。"}, 409);
    return authReply({ok: true, requiresLogin: true});
  } catch (error) {return authError(error);}
}
