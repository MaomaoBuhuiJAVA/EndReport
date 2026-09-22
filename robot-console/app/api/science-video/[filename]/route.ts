import { isPackagedStoryVideoFilename } from "@/lib/science-video";

export const runtime = "nodejs";
export const maxDuration = 60;

const RELEASE_DOWNLOAD_ROOT =
  "https://github.com/MaomaoBuhuiJAVA/EndReport/releases/download/science-media-v1/";
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

type RouteContext = { params: Promise<{ filename: string }> };

function boundedRange(value: string | null) {
  if (!value) return `bytes=0-${MAX_CHUNK_BYTES - 1}`;

  const explicit = value.match(/^bytes=(\d+)-(\d*)$/iu);
  if (explicit) {
    const start = Number(explicit[1]);
    const requestedEnd = explicit[2] ? Number(explicit[2]) : start + MAX_CHUNK_BYTES - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
      return null;
    }
    return `bytes=${start}-${Math.min(requestedEnd, start + MAX_CHUNK_BYTES - 1)}`;
  }

  const suffix = value.match(/^bytes=-(\d+)$/iu);
  if (suffix) {
    const length = Number(suffix[1]);
    if (!Number.isSafeInteger(length) || length <= 0) return null;
    return `bytes=-${Math.min(length, MAX_CHUNK_BYTES)}`;
  }

  return null;
}

function responseHeaders(upstream: Response, filename: string) {
  const headers = new Headers();
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  headers.set("Content-Disposition", `inline; filename="${filename}"`);
  headers.set("Content-Type", "video/mp4");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

async function proxyScienceVideo(request: Request, context: RouteContext, headOnly: boolean) {
  const { filename } = await context.params;
  if (!isPackagedStoryVideoFilename(filename)) {
    return new Response("Video not found", { status: 404 });
  }

  const range = headOnly && !request.headers.has("range")
    ? null
    : boundedRange(request.headers.get("range"));
  if (!headOnly && !range) {
    return new Response("Invalid Range header", {
      status: 416,
      headers: { "Accept-Ranges": "bytes" },
    });
  }

  const upstreamHeaders = new Headers({
    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
    "User-Agent": "qyfck-science-video-proxy/1.0",
  });
  if (range) upstreamHeaders.set("Range", range);

  let upstream: Response;
  try {
    upstream = await fetch(`${RELEASE_DOWNLOAD_ROOT}${encodeURIComponent(filename)}`, {
      method: headOnly ? "HEAD" : "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return new Response("Video source is temporarily unavailable", { status: 502 });
  }

  if (upstream.status === 416) {
    const headers = responseHeaders(upstream, filename);
    return new Response(null, { status: 416, headers });
  }
  if (!upstream.ok || (!headOnly && (upstream.status !== 206 || !upstream.body))) {
    upstream.body?.cancel().catch(() => undefined);
    return new Response("Video source is temporarily unavailable", { status: 502 });
  }

  return new Response(headOnly ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream, filename),
  });
}

export function GET(request: Request, context: RouteContext) {
  return proxyScienceVideo(request, context, false);
}

export function HEAD(request: Request, context: RouteContext) {
  return proxyScienceVideo(request, context, true);
}
