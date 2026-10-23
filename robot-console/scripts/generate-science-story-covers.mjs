import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { generateQwenCover, loadNativeUploadEnv, ossUploadClient, putPrivateMedia } from "./lib/native-uploads.mjs";

const repoRoot = process.cwd();
await loadNativeUploadEnv(repoRoot);

const catalogPath = path.resolve(
  process.env.SCIENCE_CATALOG_PATH || path.join(repoRoot, "src", "data", "science-knowledge.json"),
);
const dryRun = process.argv.includes("--dry-run");
if (!dryRun) ossUploadClient();

function coverResource(item, coverUrl) {
  const existing = item.resources.find((resource) =>
    resource.type === "图片资源" && /(?:封面|cover|首帧)/iu.test(resource.title),
  );
  if (existing) {
    existing.publicPath = coverUrl;
    existing.externalUrl = coverUrl;
    return;
  }

  const source = item.sourceFile || item.knowledgeFile || "";
  item.resources.unshift({
    id: `RESOURCE-${createHash("sha1").update(`${item.id}:cover`).digest("hex").slice(0, 12)}`,
    type: "图片资源",
    knowledgeBaseId: item.baseId,
    semester: item.semester,
    title: `${item.title} · API 绘本封面`,
    filePath: `${source}#API封面`,
    publicPath: coverUrl,
    externalUrl: coverUrl,
    source,
    isPublic: true,
  });
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const stories = catalog.filter((item) => item.category === "科学故事");
const generated = [];
for (const [index, story] of stories.entries()) {
  const pathname = `science-story-covers/${story.id}.png`;
  let result = {url: `dry-run://${pathname}`};
  if (!dryRun) {
    const prompt = `适合幼儿园科学故事的无文字原创卡通绘本封面，明亮友好，方形构图。科学主题：${story.topic || "自然探索"}。内容意象：${String(story.body || story.excerpt || "").slice(0, 800)}。严格禁止文字、字母、数字、水印、徽章和真实儿童肖像。`;
    const imageUrl = await generateQwenCover(prompt);
    const response = await fetch(imageUrl, {redirect: "error", signal: AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`Generated image download returned ${response.status}`);
    if (Number(response.headers.get("content-length")) > 8 * 1024 * 1024) {await response.body?.cancel(); throw new Error("Generated cover exceeds 8MB");}
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Generated cover exceeds size limits");
    result = await putPrivateMedia(pathname, bytes, {contentType: response.headers.get("content-type")?.split(";")[0] || "image/png"});
  }
  story.coverUrl = result.url;
  story.imageCount = Math.max(1, Number(story.imageCount) || 0);
  story.resourceTypes = Array.from(new Set([...(story.resourceTypes || []), "图片资源"]));
  coverResource(story, result.url);
  generated.push({ id: story.id, title: story.title, coverUrl: result.url });
  console.log(`[${index + 1}/${stories.length}] ${story.title}`);
}

if (!dryRun) await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ stories: stories.length, generated, dryRun,
  ...(!dryRun ? {databaseSyncPending: true, syncCommand: `npm run sync:science-media -- --item=${generated.map(item => item.id).join(",")} --catalog='${catalogPath.replaceAll("'", "''")}'`} : {}),
}, null, 2));
