import {getSessionUser} from "@/lib/auth";
import {AuthRequestError, authError, authReply, readAuthJson} from "@/lib/auth-request";
import {isPresetAvatar} from "@/lib/account-avatar";
import {prisma} from "@/lib/prisma";

export async function PATCH(request: Request) {
  try {
    const body = await readAuthJson(request);
    const user = await getSessionUser();
    if (!user) throw new AuthRequestError("请先登录。", 401);
    const data: {name?: string; avatarKey?: string; avatarImage?: null} = {};
    if (Object.hasOwn(body, "name")) {
      if (typeof body.name !== "string") throw new AuthRequestError("请填写昵称。");
      const name = body.name.trim();
      if (!name || name.length > 50 || /[\u0000-\u001f\u007f]/u.test(name)) throw new AuthRequestError("昵称请填写 1 至 50 个字。");
      data.name = name;
    }
    if (Object.hasOwn(body, "avatarKey")) {
      if (!isPresetAvatar(body.avatarKey)) throw new AuthRequestError("请选择系统提供的头像。");
      data.avatarKey = body.avatarKey;
      data.avatarImage = null;
    }
    if (!Object.keys(data).length) throw new AuthRequestError("请先填写要修改的资料。");
    const changed = await prisma.user.updateMany({where: {id: user.id, sessionVersion: user.sessionVersion ?? 0}, data});
    if (changed.count !== 1) throw new AuthRequestError("账号已更新，请刷新后重试。", 409);
    return authReply({user: {...user, ...(data.name ? {name: data.name} : {}), ...(data.avatarKey ? {avatarKey: data.avatarKey} : {})}});
  } catch (error) {return authError(error);}
}
