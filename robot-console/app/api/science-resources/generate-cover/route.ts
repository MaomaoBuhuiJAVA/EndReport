import { NextResponse } from "next/server";
import { checkPublicRateLimit } from "@/lib/public-rate-limit";
import { persistScienceCoverImage, persistScienceCoverUrl, persistSciencePoetryCoverUrl } from "@/lib/science-cover-sync";
import { generateTeachingImage } from "@/lib/native-workflow/images";
import { ModelUnavailableError } from "@/lib/native-workflow/model";

export const runtime = "nodejs";
export const maxDuration = 120;


function fallbackCover(category: string) {
  return category === "科学故事" ? "/lab-category-buttons/story.png" : "/lab-category-buttons/poetry.png";
}

export async function POST(request: Request) {
  const limited = checkPublicRateLimit(request, "science-cover", 6);
  if (limited) return limited;
  let body: {
    itemId?: unknown;
    title?: unknown;
    category?: unknown;
    topic?: unknown;
    poem?: unknown;
    author?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body");
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim().slice(0, 160) : "";
  const category = body.category === "科学故事" ? "科学故事" : "科学诗";
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 160) : "";
  const poem = typeof body.poem === "string" ? body.poem.trim().slice(0, 6000) : "";
  if (!title) return NextResponse.json({ error: "请先填写标题" }, { status: 400 });

  const prompt = [
    `请生成一张适合幼儿园${category}资源库的无文字纯插画封面。`,
    topic ? `仅用于理解的视觉主题：${topic}。` : "",
    poem ? `仅用于理解的科学意象：${poem.slice(0, 800)}。不要把这些文字画入图片。` : "",
    "要求：明亮、友好、原创卡通绘本风格；画面突出科学主题；方形构图，主体居中，四周保留少量安全留白；不出现真实儿童面孔。题名和作者不参与绘图，只用于保存文件。",
    "画面必须是纯插画，严格禁止一切文字或类文字痕迹：不得出现中文汉字、英文或其他拉丁字母、数字、标题、作者署名、标签、标志、徽章、品牌元素、水印或乱码式伪文字；不要在任何位置绘制可读或不可读的字符。不要边框或棋盘格。",
    "STRICT NEGATIVE CONSTRAINT: the artwork must contain ZERO text or text-like marks. No Chinese characters, Latin or English letters, numbers, title, author name, labels, logos, badges, brand marks, watermarks, or gibberish/pseudo-text anywhere in the image.",
    "输出一张公开可访问的图片文件。",
    "请让最终回复包含生成的图片文件，不要只给文字描述。",
  ].filter(Boolean).join("\n");

  let sourceUrl: string;
  try {
    sourceUrl = (await generateTeachingImage({prompt, ratio: "1:1", signal: request.signal})).url;
  } catch (error) {
    if (request.signal.aborted) throw error;
    return NextResponse.json({error: error instanceof ModelUnavailableError ? error.message : "封面生成暂时失败，请稍后重试", fallbackUrl: fallbackCover(category)}, {status: 503});
  }

  const persistedCoverUrl = itemId ? await persistScienceCoverImage(sourceUrl, title) : null;
  const synced = itemId && persistedCoverUrl
    ? await (category === "科学诗"
      ? persistSciencePoetryCoverUrl(itemId, persistedCoverUrl)
      : persistScienceCoverUrl(itemId, persistedCoverUrl, category)).catch(() => null)
    : null;
  // Private OSS paths need a durable database reference before the media route
  // can serve them. Preserve the actual provider image if that write fails.
  const usableStoredUrl = synced ? persistedCoverUrl : null;
  return NextResponse.json({
    coverUrl: synced?.coverUrl || usableStoredUrl || sourceUrl,
    persisted: Boolean(usableStoredUrl),
    synced: Boolean(synced),
    ...(synced ? { itemId: synced.itemId } : {}),
    title,
    category,
  }, {headers: {"Cache-Control": "no-store"}});
}
