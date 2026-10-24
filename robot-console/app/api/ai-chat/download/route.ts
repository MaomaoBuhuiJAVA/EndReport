export const runtime = "nodejs";
export function GET() {
  return Response.json({error: "旧的文件下载链接已停用，请重新生成文档获取本站下载链接。"}, {status: 410, headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
}
