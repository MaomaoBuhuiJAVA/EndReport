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

function detectedCoverFormat(bytes: Uint8Array, declaredContentType: string) {
  const declaredExtension = COVER_CONTENT_TYPES.get(declaredContentType);
  if (declaredExtension) return { contentType: declaredContentType, extension: declaredExtension };

  const startsWith = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return { contentType: "image/png", extension: "png" };
  }
  if (startsWith(0xff, 0xd8, 0xff)) return { contentType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 6) {
    const gifHeader = String.fromCharCode(...bytes.slice(0, 6));
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
      return { contentType: "image/gif", extension: "gif" };
    }
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (startsWith(0x42, 0x4d)) return { contentType: "image/bmp", extension: "bmp" };
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))
  ) {
    return { contentType: "image/avif", extension: "avif" };
  }
  return null;
}

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

    const declaredContentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_COVER_BYTES) return null;

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_COVER_BYTES) return null;
    const format = detectedCoverFormat(new Uint8Array(buffer), declaredContentType);
    if (!format) return null;

    const blob = await put(
      `science-resource-covers/${safeCoverName(title)}-${crypto.randomUUID()}.${format.extension}`,
      new Blob([buffer], { type: format.contentType }),
      { access: "public", contentType: format.contentType, cacheControlMaxAge: 31536000 },
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
