import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {getSessionUser} from "@/lib/auth";
import {AuthRequestError, authError, authReply, checkAuthOrigin} from "@/lib/auth-request";
import {prisma} from "@/lib/prisma";

export const runtime = "nodejs";

async function readAvatarForm(request: Request) {
  const maxBytes = 3 * 1024 * 1024 + 16384;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AuthRequestError("图片超过大小限制。", 413);
  if (!request.body) throw new AuthRequestError("请选择图片。");
  let bytes = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) throw new AuthRequestError("图片超过大小限制。", 413);
      controller.enqueue(chunk);
    },
  }));
  try {return await new Response(body, {headers: request.headers}).formData();}
  catch (error) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError("无法读取上传的图片。");
  }
}

export async function POST(request: Request) {
  try {
    checkAuthOrigin(request);
    const user = await getSessionUser();
    if (!user) throw new AuthRequestError("请先登录。", 401);
    const form = await readAvatarForm(request);
    const file = form.get("avatar");
    if (!(file instanceof File) || !file.size || file.size > 3 * 1024 * 1024) throw new AuthRequestError("请选择不超过 3 MB 的图片。");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new AuthRequestError("头像支持 JPG、PNG 和 WebP 图片。");
    let avatarImage: Buffer;
    try {
      const input = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(input, {limitInputPixels: 16000000}).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "")) throw new Error("Unsupported image");
      avatarImage = await sharp(input, {limitInputPixels: 16000000}).rotate().resize(192, 192, {fit: "cover"}).webp({quality: 82}).toBuffer();
      if (avatarImage.length > 65536) throw new Error("Image too large");
    } catch {throw new AuthRequestError("无法读取这张图片，请换一张 JPG、PNG 或 WebP 图片。");}
    const avatarKey = `upload_${randomUUID()}`;
    const changed = await prisma.user.updateMany({where: {id: user.id, sessionVersion: user.sessionVersion ?? 0}, data: {avatarKey, avatarImage: new Uint8Array(avatarImage)}});
    if (changed.count !== 1) throw new AuthRequestError("账号已更新，请刷新后重试。", 409);
    return authReply({user: {...user, avatarKey}});
  } catch (error) {
    return authError(error);
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return authReply({error: "请先登录。"}, 401);
  try {
    const profile = await prisma.user.findUnique({where: {id: user.id}, select: {avatarImage: true}});
    if (!profile?.avatarImage) return authReply({error: "尚未上传头像。"}, 404);
    return new Response(new Uint8Array(profile.avatarImage), {headers: {"Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}});
  } catch {return authReply({error: "头像暂时无法读取。"}, 503);}
}
