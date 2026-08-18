import {
  aiChatDownloadContentDisposition,
  documentDownloadContentType,
  normalizeDifyDocumentDownload,
  MAX_AI_CHAT_DOWNLOAD_BYTES,
} from "@/lib/ai-chat-download";
import { verifyAiChatDownloadToken } from "@/lib/ai-chat-download-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function downloadError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

type BoundedBody = Uint8Array | "too-large" | "aborted" | null;

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<BoundedBody> {
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelReader = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    for (;;) {
      if (signal.aborted) return "aborted";
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > MAX_AI_CHAT_DOWNLOAD_BYTES) {
        await reader.cancel();
        return "too-large";
      }
      chunks.push(value);
    }
  } catch {
    return signal.aborted ? "aborted" : null;
  } finally {
    signal.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");
  // Raw upstream URL/name parameters are intentionally unsupported. A
  // browser must receive a server-issued, short-lived token instead.
  if (!token || requestUrl.searchParams.has("url") || requestUrl.searchParams.has("name")) {
    return downloadError("无效的生成文件下载地址", 400);
  }

  const signedFile = process.env.DIFY_API_KEY
    ? verifyAiChatDownloadToken(token, process.env.DIFY_API_KEY)
    : null;
  const file = signedFile
    ? normalizeDifyDocumentDownload(signedFile, { difyApiUrl: process.env.DIFY_API_URL })
    : null;
  const contentType = file ? documentDownloadContentType(file) : null;
  if (!file || !contentType) {
    return downloadError("无效的生成文件下载地址", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(file.url, { redirect: "error", signal: request.signal });
  } catch {
    if (request.signal.aborted) return downloadError("下载已取消", 499);
    return downloadError("生成文件暂时不可下载，请稍后重试。", 502);
  }

  if (!upstream.ok) {
    return downloadError("生成文件暂时不可下载，请稍后重试。", 502);
  }

  const contentLengthHeader = upstream.headers.get("Content-Length");
  if (contentLengthHeader) {
    const normalizedContentLength = contentLengthHeader.trim();
    const contentLength = /^\d+$/u.test(normalizedContentLength)
      ? Number(normalizedContentLength)
      : Number.NaN;
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return downloadError("生成文件大小无效，请稍后重试。", 502);
    }
    if (contentLength > MAX_AI_CHAT_DOWNLOAD_BYTES) {
      return downloadError("生成文件过大，暂不支持下载。", 413);
    }
  }

  const body = await readBoundedBody(upstream, request.signal);
  if (body === "aborted") return downloadError("下载已取消", 499);
  if (body === "too-large") return downloadError("生成文件过大，暂不支持下载。", 413);
  if (!body) return downloadError("生成文件内容为空，请稍后重试。", 502);

  return new Response(body.buffer as ArrayBuffer, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": aiChatDownloadContentDisposition(file),
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
