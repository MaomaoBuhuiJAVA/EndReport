import { randomUUID } from "node:crypto";

export const SUBMIT_AGE_GROUPS = ["托班", "小班", "中班", "大班"] as const;
export const SUBMIT_CATEGORIES = ["科学诗", "科学故事"] as const;

export type ScienceSubmitCategory = (typeof SUBMIT_CATEGORIES)[number];

export type ScienceResourceSubmitInput = {
  category: ScienceSubmitCategory;
  title: string;
  ageLabel: string;
  topic: string;
  author: string;
  body: string;
  excerpt: string;
  sourceFile: string;
  videoUrl: string;
  coverUrl: string;
  documentUrl: string;
  documentName: string;
  supportingUrl: string;
  supportingName: string;
};

export type ScienceSubmitValidation =
  | { ok: true; value: ScienceResourceSubmitInput }
  | { ok: false; error: string };

function text(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, maxLength);
}

/** Only public HTTPS URLs or same-origin paths may enter the public catalogue. */
export function publicResourceUrl(value: unknown) {
  const candidate = text(value, 2048);
  if (!candidate) return "";
  if (candidate.startsWith("/")) return candidate;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : "";
  } catch {
    return "";
  }
}

export function createScienceResourceIds(prefix: "POEM" | "STORY") {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toLowerCase();
  return {
    id: `${prefix}-${suffix}`,
    baseId: `BASE-${suffix}`,
  };
}

export function validateScienceResourceSubmit(
  input: Record<string, unknown>,
): ScienceSubmitValidation {
  const category = text(input.category, 20);
  const title = text(input.title, 120);
  const ageLabel = text(input.ageLabel, 20);
  const topic = text(input.topic, 120);
  const author = text(input.author, 120);
  const body = text(input.body, 100_000);
  const excerpt = text(input.excerpt, 1_000) || body.slice(0, 500);
  const sourceFile = text(input.sourceFile, 240);
  const videoUrl = publicResourceUrl(input.videoUrl);
  const coverUrl = publicResourceUrl(input.coverUrl);
  const documentUrl = publicResourceUrl(input.documentUrl);
  const documentName = text(input.documentName, 160);
  const supportingUrl = publicResourceUrl(input.supportingUrl);
  const supportingName = text(input.supportingName, 160);

  if (!SUBMIT_CATEGORIES.includes(category as ScienceSubmitCategory)) {
    return { ok: false, error: "只支持新增科学诗或科学故事" };
  }
  if (!title) return { ok: false, error: "请填写标题" };
  if (!ageLabel || !SUBMIT_AGE_GROUPS.includes(ageLabel as (typeof SUBMIT_AGE_GROUPS)[number])) {
    return { ok: false, error: "请选择有效的年龄段" };
  }
  if (!topic) return { ok: false, error: "请填写主题" };
  if (!body && category === "科学诗") return { ok: false, error: "科学诗正文不能为空" };
  if (!videoUrl && category === "科学故事") {
    return { ok: false, error: "科学故事需要提供视频地址或上传视频" };
  }
  if (input.videoUrl && !videoUrl) return { ok: false, error: "视频地址必须是 HTTPS 地址" };
  if (input.coverUrl && !coverUrl) return { ok: false, error: "封面地址必须是 HTTPS 地址或站内路径" };
  if (input.documentUrl && !documentUrl) return { ok: false, error: "文档地址必须是 HTTPS 地址或站内路径" };
  if (input.supportingUrl && !supportingUrl) return { ok: false, error: "补充材料地址必须是 HTTPS 地址或站内路径" };

  return {
    ok: true,
    value: {
      category: category as ScienceSubmitCategory,
      title,
      ageLabel,
      topic,
      author,
      body,
      excerpt,
      sourceFile,
      videoUrl,
      coverUrl,
      documentUrl,
      documentName,
      supportingUrl,
      supportingName,
    },
  };
}
