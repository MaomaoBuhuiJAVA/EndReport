import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CATEGORIES = ["科学诗", "科学故事", "科学实验"];
const AGE_GROUPS = ["托班", "小班", "中班", "大班"];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function publicUrl(resource, publicBaseUrl) {
  if (!resource.publicPath) return "";
  return `${publicBaseUrl}${resource.publicPath.startsWith("/") ? resource.publicPath : `/${resource.publicPath}`}`;
}

function resourceLines(resources, publicBaseUrl) {
  const lines = [];

  for (const resource of resources.filter((item) => item.isPublic !== false)) {
    const assetUrl = publicUrl(resource, publicBaseUrl);

    if (resource.type === "图片资源" && assetUrl) {
      lines.push(`- [RESOURCE:${resource.id}] 图片：![${resource.title}](${assetUrl})`);
      continue;
    }

    if (resource.type === "视频资源") {
      if (resource.externalUrl) lines.push(`- [RESOURCE:${resource.id}] 视频：${resource.title} [打开视频](${resource.externalUrl})`);
      if (assetUrl) lines.push(`- [RESOURCE:${resource.id}] 二维码：![${resource.title}二维码](${assetUrl})`);
      continue;
    }

  }

  return lines;
}

function renderKnowledgeItem(item, publicBaseUrl) {
  const metadata = [
    `- 资源类别：${item.category}`,
    `- 年龄段：${item.ageLabel}`,
    `- 科学主题：${item.topic}`,
    `- 关键词：${item.tags?.join("、") || item.topic}`,
    `- 资料编号：${item.id}`,
    `- 资源主键：[BASE:${item.baseId}]`,
  ];

  const resources = resourceLines(item.resources ?? [], publicBaseUrl);

  return [
    `# 《${item.title}》 [LAB:${item.id}]`,
    "",
    ...metadata,
    "",
    "## 教学内容",
    item.body.trim() || item.excerpt.trim(),
    "",
    "## 图片与视频资源",
    ...(resources.length ? resources : ["- 暂无可公开展示的图片、视频或二维码资源。"]),
    "",
  ].join("\n");
}

function renderGroupDocument(category, ageLabel, items, publicBaseUrl) {
  const itemContent = items
    .slice()
    .sort((left, right) => left.topic.localeCompare(right.topic, "zh-CN") || left.title.localeCompare(right.title, "zh-CN"))
    .map((item) => renderKnowledgeItem(item, publicBaseUrl))
    .join("\n---\n\n");

  return [
    `# 国科二幼 ${category}｜${ageLabel}`,
    "",
    "本文件是国科二幼教学智能体的检索资料。回答时应优先引用与用户年龄段和主题一致的条目；若用户未说明年龄段，应说明当前采用的默认年龄假设。",
    "",
    itemContent || "本年龄段暂未收录该类别资料。",
  ].join("\n");
}

function renderMediaIndex(items, publicBaseUrl) {
  const rows = items
    .flatMap((item) => {
      const publicResources = (item.resources ?? []).filter(
        (resource) => resource.isPublic !== false && (resource.publicPath || resource.externalUrl),
      );

      if (!publicResources.length) return [];

      return publicResources.map((resource) => {
        const assetUrl = publicUrl(resource, publicBaseUrl);
        const links = [];
        if (resource.externalUrl) links.push(`[打开视频](${resource.externalUrl})`);
        if (assetUrl) {
          const label = resource.type === "视频资源" ? "查看二维码" : "查看图片";
          links.push(`[${label}](${assetUrl})`);
        }

        const resourceTitle = resource.title ? `（${resource.title}）` : "";
        return `- [LAB:${item.id}] [BASE:${item.baseId}] [RESOURCE:${resource.id}] 《${item.title}》｜${item.category}｜${item.ageLabel}｜${item.topic}｜${resource.type}${resourceTitle}：${links.join("；")}`;
      });
    });

  return [
    "# 国科二幼多媒体资源索引",
    "",
    "当教师明确要求图片、视频、二维码或实验步骤图时，从与其年龄段、主题和条目标题最一致的项目中返回最多三项链接；视频二维码与视频链接需要一并保留。",
    "",
    "## 资源索引",
    ...(rows.length ? rows : ["暂无公开多媒体资源。"]),
    "",
  ].join("\n");
}

export function buildDifyKnowledgeDocuments(items, baseUrl) {
  const publicBaseUrl = normalizeBaseUrl(baseUrl);
  const documents = [];

  for (const category of CATEGORIES) {
    for (const ageLabel of AGE_GROUPS) {
      const groupedItems = items.filter((item) => item.category === category && item.ageLabel === ageLabel);
      documents.push({
        fileName: `${category}-${ageLabel}.md`,
        itemCount: groupedItems.length,
        content: renderGroupDocument(category, ageLabel, groupedItems, publicBaseUrl),
      });
    }
  }

  documents.push({
    fileName: "多媒体资源索引.md",
    itemCount: items.length,
    content: renderMediaIndex(items, publicBaseUrl),
  });

  return { totalItems: items.length, documents };
}

function readme(result) {
  const summary = result.documents
    .map((document) => `- ${document.fileName}：${document.itemCount} 条资料`)
    .join("\n");

  return [
    "# Dify 知识库上传说明",
    "",
    "请在 Dify 创建知识库后一次上传本目录中的 13 个 Markdown 文件（不上传本 README）。建议使用高质量索引、自动分段和中文检索。",
    "",
    "## 文件清单",
    summary,
    "",
    "所有媒体链接均指向站点的公开资源。若域名变化，请重新运行 `npm run export:dify` 并传入新的 `DIFY_PUBLIC_BASE_URL`。",
    "",
  ].join("\n");
}

export async function writeDifyKnowledgeDocuments({ catalogPath, outputDir, publicBaseUrl }) {
  const items = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const result = buildDifyKnowledgeDocuments(items, publicBaseUrl);
  await fs.mkdir(outputDir, { recursive: true });

  await Promise.all(
    result.documents.map((document) => fs.writeFile(path.join(outputDir, document.fileName), document.content, "utf8")),
  );
  await fs.writeFile(path.join(outputDir, "README.md"), readme(result), "utf8");

  return result;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(scriptPath).href) {
  const scriptDirectory = path.dirname(scriptPath);
  const projectRoot = path.resolve(scriptDirectory, "..");
  const result = await writeDifyKnowledgeDocuments({
    catalogPath: path.join(projectRoot, "src", "data", "science-knowledge.json"),
    outputDir: path.join(projectRoot, "dify", "knowledge"),
    publicBaseUrl: process.env.DIFY_PUBLIC_BASE_URL ?? "https://www.qyfck.icu",
  });

  console.log(`已生成 ${result.documents.length} 个 Dify 知识文件，包含 ${result.totalItems} 条教学资料。`);
}
