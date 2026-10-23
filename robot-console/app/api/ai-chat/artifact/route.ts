import { readTeachingArtifact } from "@/lib/native-workflow/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const file = await readTeachingArtifact(token, request.signal);
    if (!file) return Response.json({ error: "文档不存在或下载链接已过期，请重新生成。" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": `attachment; filename="teaching-document.${file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin"}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return Response.json({ error: "文档下载暂时不可用，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
