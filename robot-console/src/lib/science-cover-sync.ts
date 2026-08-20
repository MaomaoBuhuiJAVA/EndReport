import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { publicResourceUrl } from "@/lib/science-resource-submit";

const MAX_COVER_BYTES = 8 * 1024 * 1024;
const COVER_CONTENT_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/bmp", "bmp"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export type SciencePoetryCoverSync = {
  itemId: string;
  title: string;
  coverUrl: string;
};

function safeCoverName(title: string) {
  return title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/gu, "-").slice(0, 80) || "science-cover";
}

function trustedDifyUrl(value: string, difyApiUrl?: string) {
  try {
    const source = new URL(value);
    const apiOrigin = difyApiUrl ? new URL(difyApiUrl).origin : "";
    return source.hostname === "dify.ai" ||
      source.hostname.endsWith(".dify.ai") ||
      source.hostname === "udify.app" ||
      source.hostname.endsWith(".udify.app") ||
      source.origin === apiOrigin;
  } catch {
    return false;
  }
}

/**
 * Copies a generated image into public Blob storage so an expiring upstream
 * Dify file URL never becomes the resource library's permanent cover.
 */
export async function persistScienceCoverImage(
  sourceUrl: string,
  title: string,
  options: { difyApiUrl?: string; difyApiKey?: string } = {},
) {
  const url = publicResourceUrl(sourceUrl);
  if (!url) return null;

  const headers = options.difyApiKey && trustedDifyUrl(url, options.difyApiUrl)
    ? { Authorization: `Bearer ${options.difyApiKey}` }
    : undefined;
  try {
    const response = await fetch(url, { headers, redirect: "follow" });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    const extension = COVER_CONTENT_TYPES.get(contentType);
    if (!extension) return null;

    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_COVER_BYTES) return null;

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_COVER_BYTES) return null;

    const blob = await put(
      `science-resource-covers/${safeCoverName(title)}-${crypto.randomUUID()}.${extension}`,
      new Blob([bytes], { type: contentType }),
      { access: "public", contentType, cacheControlMaxAge: 31536000 },
    );
    return blob.url;
  } catch {
    return null;
  }
}

/**
 * Replaces one explicitly selected science-poem cover.  This is server-only:
 * callers never get a public endpoint that can write an arbitrary image URL.
 */
export async function synchronizeSciencePoetryCover(
  itemId: string,
  sourceUrl: string,
  options: { difyApiUrl?: string; difyApiKey?: string } = {},
): Promise<SciencePoetryCoverSync | null> {
  const id = itemId.trim().slice(0, 160);
  if (!id) return null;
  const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
  if (!item || item.category !== "科学诗") return null;

  const coverUrl = await persistScienceCoverImage(sourceUrl, item.title, options);
  if (!coverUrl) return null;

  return persistSciencePoetryCoverUrl(itemId, coverUrl);
}

/**
 * Persists an already-public cover URL for a science poem. This is kept
 * separate from image fetching so the public upload flow can complete the
 * same durable update after its async cover-generation request.
 */
export async function persistSciencePoetryCoverUrl(
  itemId: string,
  coverUrl: string,
): Promise<SciencePoetryCoverSync | null> {
  const id = itemId.trim().slice(0, 160);
  if (!id) return null;

  let normalizedCoverUrl: string;
  try {
    const parsed = new URL(coverUrl.trim());
    if (!/^https?:$/u.test(parsed.protocol)) return null;
    normalizedCoverUrl = parsed.toString();
  } catch {
    return null;
  }

  const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
  if (!item || item.category !== "科学诗") return null;

  await prisma.$transaction(async (tx) => {
    await tx.scienceKnowledgeResource.deleteMany({
      where: {
        knowledgeBaseId: item.baseId,
        resourceType: "图片资源",
        title: { contains: "封面" },
      },
    });
    await tx.scienceKnowledgeResource.create({
      data: {
        id: `RESOURCE-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
        resourceType: "图片资源",
        knowledgeBaseId: item.baseId,
        semester: item.semester,
        title: `${item.title} · 封面`,
        filePath: item.sourceFile,
        publicPath: normalizedCoverUrl,
        externalUrl: normalizedCoverUrl,
        source: "科小贝智能体生成封面",
        isPublic: true,
        sortOrder: 0,
      },
    });
    const imageCount = await tx.scienceKnowledgeResource.count({
      where: { knowledgeBaseId: item.baseId, resourceType: "图片资源", isPublic: true },
    });
    await tx.scienceKnowledgeItem.update({ where: { id }, data: { imageCount } });
  });

  return { itemId: item.id, title: item.title, coverUrl: normalizedCoverUrl };
}
