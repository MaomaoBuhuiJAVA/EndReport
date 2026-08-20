import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { checkPublicRateLimit } from "@/lib/public-rate-limit";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

/**
 * Issues a constrained Vercel Blob client token. The browser uploads the
 * selected video/image directly to Blob, then sends the returned public URL to
 * POST /api/science-resources. No read-write token is exposed to the client.
 */
export async function POST(request: Request) {
  const limited = checkPublicRateLimit(request, "science-upload-token", 20);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "上传请求格式无效" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      request,
      body: body as never,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const normalizedPath = pathname.replaceAll("\\", "/");
        if (!normalizedPath.startsWith("science-resources/")) {
          throw new Error("资料上传路径无效");
        }
        if (clientPayload && clientPayload.length > 1000) {
          throw new Error("上传参数过长");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          cacheControlMaxAge: 31536000,
        };
      },
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "文件暂时无法上传，请稍后重试" }, { status: 503 });
  }
}
