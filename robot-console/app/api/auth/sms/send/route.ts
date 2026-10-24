import {authError, authPhone, authReply, readAuthJson, AuthRequestError} from "@/lib/auth-request";
import {getSessionUser} from "@/lib/auth";
import {sendSms, isSmsPurpose} from "@/lib/sms";
export async function POST(request: Request) {
  try {
    const body = await readAuthJson(request); const phone = authPhone(body.phone);
    if (!isSmsPurpose(body.purpose)) throw new AuthRequestError("验证码用途无效。");
    if (body.purpose === "admin") throw new AuthRequestError("请从管理员入口获取验证码。", 403);
    let principal: string | undefined;
    if (body.purpose === "phone_current" || body.purpose === "phone_new") {
      const user = await getSessionUser();
      if (!user) throw new AuthRequestError("请先登录后修改手机号。", 401);
      principal = user.id;
      if (body.purpose === "phone_current" && user.phone !== phone) throw new AuthRequestError("请使用当前绑定的手机号。");
      if (body.purpose === "phone_new" && user.phone === phone) throw new AuthRequestError("新手机号需与当前绑定的号码不同。");
    }
    // The trusted reverse proxy must overwrite this header; quotas also cap each phone and total daily sends.
    const sender = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "direct-client";
    return authReply(await sendSms(phone, body.purpose, sender, principal));
  } catch (error) {return authError(error);}
}
