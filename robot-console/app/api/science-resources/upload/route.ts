import { NextResponse } from "next/server";
import { checkPublicRateLimit } from "@/lib/public-rate-limit";
import { persistOssUpload, readUploadForm, OssUploadValidationError } from "@/lib/oss-upload";

export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const folders = new Set(["poems", "stories", "supporting", "covers"]);

export async function POST(request: Request) {
  const limited = checkPublicRateLimit(request, "science-material-upload", 20);
  if (limited) return limited;
  let form: FormData;
  try {form = await readUploadForm(request, MAX_UPLOAD_BYTES + 64 * 1024);} catch (error) {
    if (error instanceof OssUploadValidationError) return NextResponse.json({error: error.message}, {status: error.status});
    return NextResponse.json({error: "上传请求格式无效"}, {status: 400});
  }
  const file = form.get("file"), folder = form.get("folder");
  if (!(file instanceof File) || typeof folder !== "string" || !folders.has(folder)) return NextResponse.json({error: "请选择有效文件及资料类型"}, {status: 400});
  try {
    const stored = await persistOssUpload(file, {folder: `science-resources/${folder}`, maxBytes: MAX_UPLOAD_BYTES});
    return NextResponse.json({url: stored.url}, {status: 201, headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    if (error instanceof OssUploadValidationError) return NextResponse.json({error: error.message}, {status: error.status});
    return NextResponse.json({error: "文件暂时无法保存，请稍后重试"}, {status: 503});
  }
}
