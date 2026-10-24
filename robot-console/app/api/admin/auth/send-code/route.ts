import {authError, authPhone, authReply, readAuthJson, AuthRequestError} from "@/lib/auth-request";
import {ADMIN_PHONE} from "@/lib/auth";
import {prisma} from "@/lib/prisma";
import {sendSms} from "@/lib/sms";

export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request);
    const phone = authPhone(body.phone);
    if (phone !== ADMIN_PHONE) throw new AuthRequestError("管理员手机号无效。", 403);
    const admin = await prisma.user.findUnique({where: {phone}, select: {id: true, role: true}});
    if (!admin || admin.role !== "ADMIN") throw new AuthRequestError("该手机号没有管理员权限。", 403);
    const sender = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "direct-client";
    return authReply(await sendSms(phone, "admin", sender));
  } catch (error) {
    return authError(error);
  }
}
