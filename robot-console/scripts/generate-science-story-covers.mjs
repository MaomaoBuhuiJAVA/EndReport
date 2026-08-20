import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import dotenv from "dotenv";

const repoRoot = process.cwd();
dotenv.config({ path: path.resolve(".env.local") });
dotenv.config({ path: path.resolve(".env.production") });
dotenv.config({ path: path.resolve(repoRoot, "..", ".env.production") });

const catalogPath = path.resolve(
  process.env.SCIENCE_CATALOG_PATH || path.join(repoRoot, "src", "data", "science-knowledge.json"),
);
const sourceRoot = path.resolve(
  process.env.SCIENCE_SOURCE_DIR || path.join(repoRoot, "..", "..", "科学诗、科学故事、科学教案、科学实验"),
);
const storyRoot = path.join(sourceRoot, "科学故事");
const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const dryRun = process.argv.includes("--dry-run");
const supportedVideo = /\.(mp4|webm|mov|m4v)$/iu;

if (!token && !dryRun) throw new Error("BLOB_READ_WRITE_TOKEN is required");

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000]/gu, "")
    .replaceAll("《", "")
    .replaceAll("》", "")
    .trim();
}

function titleFromFile(filePath) {
  return path.basename(filePath).match(/《([^》]+)》/u)?.[1]?.trim() || "";
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  }));
  return nested.flat();
}

function captureFrame(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-ss", "0.1", "-i", filePath,
      "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libwebp",
      "-quality", "82", "-f", "webp", "pipe:1",
    ], { windowsHide: true });
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0 || !chunks.length) {
        reject(new Error(Buffer.concat(errors).toString("utf8") || `ffmpeg exited with ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

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
    title: `${item.title} · 视频首帧封面`,
    filePath: `${source}#首帧封面`,
    publicPath: coverUrl,
    externalUrl: coverUrl,
    source,
    isPublic: true,
  });
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const stories = catalog.filter((item) => item.category === "科学故事");
const videoFiles = (await walk(storyRoot)).filter((filePath) => supportedVideo.test(filePath));
const filesByTitle = new Map(videoFiles.map((filePath) => [normalizeTitle(titleFromFile(filePath)), filePath]));
const missing = stories.filter((story) => !filesByTitle.has(normalizeTitle(story.title))).map((story) => story.title);
if (missing.length) throw new Error(`Missing story videos: ${missing.join(", ")}`);

const generated = [];
for (const [index, story] of stories.entries()) {
  const filePath = filesByTitle.get(normalizeTitle(story.title));
  const pathname = `science-story-covers/${story.id}.webp`;
  const image = dryRun ? Buffer.from("dry-run") : await captureFrame(filePath);
  const result = dryRun
    ? { url: `dry-run://${pathname}` }
    : await put(pathname, image, {
      access: "public",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/webp",
      cacheControlMaxAge: 31536000,
    });
  story.coverUrl = result.url;
  story.imageCount = Math.max(1, Number(story.imageCount) || 0);
  story.resourceTypes = Array.from(new Set([...(story.resourceTypes || []), "图片资源"]));
  coverResource(story, result.url);
  generated.push({ id: story.id, title: story.title, coverUrl: result.url });
  console.log(`[${index + 1}/${stories.length}] ${story.title}`);
}

if (!dryRun) await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ stories: stories.length, generated, dryRun }, null, 2));
