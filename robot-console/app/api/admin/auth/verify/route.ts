import {ADMIN_PHONE, createAdminSmsSession} from "@/lib/auth";
import {authError, authPhone, authReply, readAuthJson, smsProof, AuthRequestError} from "@/lib/auth-request";
import {prisma} from "@/lib/prisma";
import {verifySms} from "@/lib/sms";

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    const phone = authPhone(body.phone);
    if (phone !== ADMIN_PHONE) throw new AuthRequestError("管理员手机号无效。", 403);
    const user = await prisma.user.findUnique({where: {phone}});
    if (!user || user.role !== "ADMIN") throw new AuthRequestError("该手机号没有管理员权限。", 403);
    await verifySms([smsProof(body, phone, "admin")]);
    const updated = await prisma.user.updateMany({
      where: {id: user.id, phone, role: "ADMIN", sessionVersion: user.sessionVersion},
      data: {phoneVerified: true, lastLoginAt: new Date(), lastLoginMethod: "sms"},
    });
    if (updated.count !== 1) throw new AuthRequestError("账号已更新，请重新获取验证码。", 409);
    await createAdminSmsSession(user.id);
    return authReply({verified: true});
  } catch (error) {
    return authError(error);
  }
}
