import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOssClient, isStudentWorkObjectKey, mediaObjectKey, mediaRouteUrl } from "@/lib/oss-media";
import manifestData from "@/data/oss-media-manifest.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = { key: string; sourceUrl?: string; sourcePath?: string; publicCatalog: boolean };
const manifest = manifestData as Entry[];
const inlineTypes = /^(?:image\/(?:png|jpeg|webp|avif|gif|bmp)|video\/(?:mp4|webm|quicktime)|audio\/(?:mpeg|mp4|wav|ogg|webm))$/u;
const mediaTypesByExtension: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  avif: "image/avif", gif: "image/gif", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
};

async function accessFor(entry: Entry, requestUrl: string, requestedKey: string): Promise<"public" | "private" | null> {
  const studentWorkKey = isStudentWorkObjectKey(entry.key);
  if (entry.publicCatalog && !studentWorkKey) return "public";
  const paths = [...new Set([entry.key, requestedKey])];
  const references = [...new Set([
    entry.sourceUrl,
    ...paths.flatMap((value) => {
      const path = mediaRouteUrl(value);
      return [path, decodeURIComponent(path), new URL(path, requestUrl).href];
    }),
  ].filter((value): value is string => Boolean(value)))];
  try {
    const work = await prisma.studentWork.findFirst({
      where: { OR: [
        { mediaUrl: { in: references } },
        { thumbnailUrl: { in: references } },
        ...(entry.sourcePath ? [
          { mediaUrl: { endsWith: entry.sourcePath } },
          { thumbnailUrl: { endsWith: entry.sourcePath } },
        ] : []),
      ] },
      select: { ownerId: true, status: true, visibility: true },
    });
    if (work) {
      if (work.status === "APPROVED" && work.visibility === "PUBLIC") return "public";
      const user = await getSessionUser();
      return user && user.id !== "public-participant" && (user.role === "ADMIN" || user.id === work.ownerId) ? "private" : null;
    }
    // A catalogue reference cannot publish a private or unregistered work.
    if (studentWorkKey) return null;
    const resource = await prisma.scienceKnowledgeResource.findFirst({
      where: { isPublic: true, OR: [
        { publicPath: { in: references } },
        { externalUrl: { in: references } },
        ...(entry.sourcePath ? [
          { publicPath: { endsWith: entry.sourcePath } },
          { externalUrl: { endsWith: entry.sourcePath } },
        ] : []),
      ] },
      select: { id: true },
    });
    return resource ? "public" : null;
  } catch { return null; }
}

function migrationSuffix(value: string) {
  const segments = value.split("/");
  return segments[0] === "migrated" && segments.length >= 4 ? segments.slice(3).join("/") : null;
}

function findManifestEntry(key: string) {
  const exact = manifest.find((item) => item.key === key);
  if (exact) return exact;
  const suffix = migrationSuffix(key);
  if (!suffix) return undefined;
  const matches = manifest.filter((item) => migrationSuffix(item.key) === suffix);
  return matches.length === 1 ? matches[0] : undefined;
}

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = mediaObjectKey(segments);
  const entry = key ? findManifestEntry(key)
    // New uploads become readable only after a catalogue/work record grants
    // access. Unknown migrated backups must still remain outside this route.
    ?? (key.startsWith("uploads/") ? { key, sourceUrl: "", publicCatalog: false } : undefined) : undefined;
  const access = entry ? await accessFor(entry, request.url, key ?? "") : null;
  if (!key || !entry || !access) return new Response("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers();
  const range = request.headers.get("range");
  if (range) {
    if (!/^bytes=(?:\d+-\d*|-\d+)$/u.test(range)) return new Response(null, { status: 416 });
    headers.set("range", range);
  }
  try {
    const url = createOssClient().signatureUrl(entry.key, { expires: 60 });
    const upstream = await fetch(url, { headers, cache: "no-store", signal: request.signal });
    if (upstream.status !== 200 && upstream.status !== 206) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status === 416 ? 416 : 502, headers: { "Cache-Control": "no-store" } });
    }
    const responseHeaders = new Headers({
      "Cache-Control": access === "public" ? "public, max-age=300" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    });
    for (const name of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    let contentType = upstream.headers.get("content-type")?.split(";", 1)[0] || "application/octet-stream";
    if (contentType === "application/octet-stream") {
      const extension = key.split(".").at(-1)?.toLowerCase() || "";
      contentType = mediaTypesByExtension[extension] || contentType;
    }
    responseHeaders.set("content-type", inlineTypes.test(contentType) ? contentType : "application/octet-stream");
    responseHeaders.set("content-disposition", inlineTypes.test(contentType) ? "inline" : "attachment");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response("Media temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
