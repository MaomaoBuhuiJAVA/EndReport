import { createOssClient, mediaRouteUrl } from "./oss-media";

export class OssUploadValidationError extends Error {
  constructor(message: string, public readonly status = 400) {super(message); this.name = "OssUploadValidationError";}
}

/** Also limits chunked bodies whose sender omitted Content-Length. */
export async function readUploadForm(request: Request, maxBodyBytes: number): Promise<FormData> {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw new OssUploadValidationError("文件超过大小限制", 413);
  if (!request.body) throw new OssUploadValidationError("上传内容为空");
  let bytes = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBodyBytes) throw new OssUploadValidationError("文件超过大小限制", 413);
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, {headers: request.headers}).formData();
}

const mimeByExtension: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml", heic: "image/heic", heif: "image/heif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", avi: "video/x-msvideo", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac",
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain",
};
const mimeAliases: Record<string, string> = {"audio/x-wav": "audio/wav", "audio/x-m4a": "audio/mp4", "image/x-ms-bmp": "image/bmp", "video/x-m4v": "video/mp4", "video/avi": "video/x-msvideo", "video/msvideo": "video/x-msvideo"};
const allowedMime = new Set([...Object.values(mimeByExtension), "audio/webm", ...Object.keys(mimeAliases)]);

function uploadMime(file: File): string {
  const declared = file.type.toLowerCase().trim();
  const inferred = mimeByExtension[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
  const canonical = mimeAliases[declared] ?? declared;
  if (!declared || declared === "application/octet-stream") {
    if (inferred) return inferred;
  } else if (allowedMime.has(declared) && (!inferred || inferred === canonical || (inferred === "video/webm" && canonical === "audio/webm"))) return canonical;
  throw new OssUploadValidationError("文件类型不支持或与扩展名不一致");
}

/** Private objects become readable only when a database record grants access. */
export async function persistOssUpload(file: File, {folder, maxBytes}: {folder: string; maxBytes: number}): Promise<{url: string; key: string}> {
  if (!/^(?:science-resources\/(?:poems|stories|supporting|covers|videos)|science-resource-covers|student-works\/[a-zA-Z0-9_-]{1,160})$/u.test(folder)) throw new OssUploadValidationError("文件保存路径无效");
  if (!file.name.trim() || !file.size) throw new OssUploadValidationError("请选择有效文件");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || file.size > maxBytes) throw new OssUploadValidationError("文件超过大小限制", 413);
  const contentType = uploadMime(file);
  const name = file.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/gu, "-").slice(-120) || "upload";
  const key = `uploads/${folder}/${crypto.randomUUID()}-${name}`;
  await createOssClient().put(key, Buffer.from(await file.arrayBuffer()), {
    headers: {"Content-Type": contentType, "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true"},
  });
  return {url: mediaRouteUrl(key), key};
}
