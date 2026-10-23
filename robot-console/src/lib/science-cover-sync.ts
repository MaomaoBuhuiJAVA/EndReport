import { prisma } from "@/lib/prisma";
import { isGeneratedImageUrl } from "@/lib/generated-image-url";
import { createOssClient, mediaObjectKey, mediaRouteUrl } from "@/lib/oss-media";

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

/** Copies a verified Qwen image into the existing private OSS bucket. */
export async function persistScienceCoverImage(
  sourceUrl: string,
  title: string,
) {
  try {
    const url = new URL(sourceUrl);
    if (!isGeneratedImageUrl(url)) return null;
    const client = createOssClient();
    const response = await fetch(url.toString(), {redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000)});
    if (!response.ok) return null;

    const declaredContentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";

    const advertisedLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_COVER_BYTES) return null;

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_COVER_BYTES) return null;
    const format = detectedCoverFormat(new Uint8Array(buffer), declaredContentType);
    if (!format) return null;

    const key = `uploads/science-resource-covers/${safeCoverName(title)}-${crypto.randomUUID()}.${format.extension}`;
    await client.put(key, Buffer.from(buffer), {
      headers: {"Content-Type": format.contentType, "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true"},
    });
    return mediaRouteUrl(key);
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
): Promise<SciencePoetryCoverSync | null> {
  const id = itemId.trim().slice(0, 160);
  if (!id) return null;
  const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
  if (!item || item.category !== "科学诗") return null;

  const coverUrl = await persistScienceCoverImage(sourceUrl, item.title);
  if (!coverUrl) return null;

  return persistSciencePoetryCoverUrl(itemId, coverUrl);
}

/**
 * Persists the controlled website path returned by server-side OSS storage.
 * Provider URLs must be copied before any catalogue writeback.
 */
export async function persistSciencePoetryCoverUrl(
  itemId: string,
  coverUrl: string,
): Promise<SciencePoetryCoverSync | null> {
  return persistScienceCoverUrl(itemId, coverUrl, "科学诗");
}

/** Both catalogue categories use the same durable image delivery and writeback. */
export async function persistScienceCoverUrl(
  itemId: string,
  coverUrl: string,
  category: "科学诗" | "科学故事",
): Promise<SciencePoetryCoverSync | null> {
  const id = itemId.trim().slice(0, 160);
  if (!id) return null;

  let normalizedCoverUrl: string;
  try {
    const candidate = coverUrl.trim();
    if (!candidate.startsWith("/api/media/uploads/science-resource-covers/") || /[?#]/u.test(candidate)) return null;
    const key = mediaObjectKey(candidate.slice("/api/media/".length).split("/").map(decodeURIComponent));
    if (!key) return null;
    normalizedCoverUrl = mediaRouteUrl(key);
  } catch {
    return null;
  }

  const item = await prisma.scienceKnowledgeItem.findUnique({ where: { id } });
  if (!item || item.category !== category) return null;

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
        source: "千问 API 生成封面",
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
