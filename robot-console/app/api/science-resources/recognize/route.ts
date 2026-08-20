import { NextResponse } from "next/server";
import { generateDifyReply, uploadDifyFile } from "@/lib/dify";
import { checkPublicRateLimit } from "@/lib/public-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PUBLIC_RECOGNITION_USER = "science-resource-public-recognition";

function isFile(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "size" in value);
}

function cleanText(value: unknown, maxLength = 6000) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, maxLength)
    : "";
}

function objectFromAnswer(answer: string) {
  const fenced = answer.match(/```(?:json)?\s*\n([\s\S]*?)\n```/iu)?.[1]?.trim();
  const candidate = fenced || answer.match(/\{[\s\S]*\}/u)?.[0];
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function fieldsFromResult(value: Record<string, unknown> | null) {
  const source = value ?? {};
  return {
    title: cleanText(source.title ?? source.poemTitle ?? source.name, 120),
    ageLabel: cleanText(source.ageLabel ?? source.age ?? source.ageGroup, 20),
    topic: cleanText(source.topic ?? source.theme ?? source.subject, 120),
    author: cleanText(source.author ?? source.creator ?? source.provider, 120),
    poemText: cleanText(source.poemText ?? source.body ?? source.content ?? source.text, 100_000),
    description: cleanText(source.description ?? source.excerpt ?? source.summary, 1000),
  };
}

export async function POST(request: Request) {
  const limited = checkPublicRateLimit(request, "science-recognize", 10);
  if (limited) return limited;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "上传格式无效" }, { status: 400 });
  }
  const file = form.get("file");
  if (!isFile(file) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "请选择不超过 20MB 的科学诗文件或图片" }, { status: 400 });
  }

  const apiKey = process.env.DIFY_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "AI 识别服务尚未配置" }, { status: 503 });
  const apiUrl = process.env.DIFY_API_URL;
  const uploaded = await uploadDifyFile({
    apiKey,
    apiUrl,
    file,
    fileName: file.name,
    user: PUBLIC_RECOGNITION_USER,
    signal: request.signal,
  });
  if (!uploaded) return NextResponse.json({ error: "文件暂时无法交给 AI 识别，请手动填写" }, { status: 503 });

  const prompt = [
    "请读取附件，提取其中的科学诗信息，并且只返回一个 JSON 对象。",
    "JSON 键必须是 title、ageLabel、topic、author、poemText、description。",
    "没有明确信息时对应值使用空字符串；不要猜测；不要输出 Markdown 或说明文字。",
  ].join("\n");
  const reply = await generateDifyReply({
    apiKey,
    apiUrl,
    message: prompt,
    user: PUBLIC_RECOGNITION_USER,
    files: [uploaded],
    signal: request.signal,
  });
  if (!reply) return NextResponse.json({ error: "AI 暂时无法识别该文件，请手动填写" }, { status: 503 });

  const fields = fieldsFromResult(objectFromAnswer(reply.answer));
  return NextResponse.json({ fields });
}
