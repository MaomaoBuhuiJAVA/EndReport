import {authError, authPhone, authReply, readAuthJson, smsProof} from "@/lib/auth-request";
import {createSession} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {verifySms} from "@/lib/sms";
export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    if (body.acceptedPolicies !== true) return authReply({error: "请先阅读并同意用户协议和隐私政策"}, 400);
    const phone = authPhone(body.phone);
    await verifySms([smsProof(body, phone, "login")]);
    const user = await prisma.user.findUnique({where: {phone}});
    if (!user) return authReply({error: "该手机号尚未注册，请先创建账号。"}, 401);
    const changed = await prisma.user.updateMany({where: {id: user.id, phone, sessionVersion: user.sessionVersion}, data: {phoneVerified: true, lastLoginAt: new Date(), lastLoginMethod: "sms"}});
    if (changed.count !== 1) return authReply({error: "账号已更新，请重新获取验证码。"}, 409);
    const session = {id: user.id, name: user.name, username: user.username, phone: user.phone, accountType: user.accountType, role: user.role, identityVerified: user.identityVerified};
    await createSession({...session, sessionVersion: user.sessionVersion});
    return authReply({user: session});
  } catch (error) {return authError(error);}
}
