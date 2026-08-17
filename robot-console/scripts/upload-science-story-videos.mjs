import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const repoRoot = process.cwd();
const catalogPath = path.resolve(
  process.env.SCIENCE_CATALOG_PATH || path.join(repoRoot, "src", "data", "science-knowledge.json"),
);
const sourceRoot = path.resolve(
  process.env.SCIENCE_SOURCE_DIR || path.join(repoRoot, "..", "..", "科学诗、科学故事、科学教案、科学实验"),
);
const storyRoot = path.join(sourceRoot, "科学故事");
const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
const dryRun = process.argv.includes("--dry-run");
const supportedVideo = /\.(mp4|webm|mov|m4v|avi)$/iu;

if (!token && !dryRun) {
  throw new Error("BLOB_READ_WRITE_TOKEN is required");
}

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
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(filePath) : [filePath];
    }),
  );
  return nested.flat();
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLocaleLowerCase("en-US");
  return extension === ".webm" ? "video/webm" : extension === ".mov" ? "video/quicktime" : "video/mp4";
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const stories = catalog.filter((item) => item.category === "科学故事");
const videoFiles = (await walk(storyRoot)).filter((filePath) => supportedVideo.test(filePath));
const filesByTitle = new Map();

for (const filePath of videoFiles) {
  const title = normalizeTitle(titleFromFile(filePath));
  if (!title) continue;
  if (filesByTitle.has(title)) throw new Error(`Duplicate story video title: ${title}`);
  filesByTitle.set(title, filePath);
}

const missing = stories
  .filter((story) => !filesByTitle.has(normalizeTitle(story.title)))
  .map((story) => story.title);
if (missing.length) throw new Error(`Missing story videos: ${missing.join(", ")}`);

const uploaded = [];
for (const [index, story] of stories.entries()) {
  const filePath = filesByTitle.get(normalizeTitle(story.title));
  const extension = path.extname(filePath).toLocaleLowerCase("en-US") || ".mp4";
  const pathname = `science-stories/${story.id}${extension}`;
  const result = dryRun
    ? { url: `dry-run://${pathname}` }
    : await put(pathname, createReadStream(filePath), {
        access: "public",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: contentType(filePath),
        cacheControlMaxAge: 31536000,
        multipart: true,
      });

  story.videoUrl = result.url;
  const videoResources = story.resources.filter((resource) => resource.type === "视频资源");
  if (!videoResources.length) throw new Error(`Story has no video resource: ${story.title}`);
  for (const resource of videoResources) resource.externalUrl = result.url;
  story.tags = Array.from(new Set([...(story.tags || []), "视频"]));
  uploaded.push({ id: story.id, title: story.title, url: result.url });
  console.log(`[${index + 1}/${stories.length}] ${story.title}`);
}

if (!dryRun) {
  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ stories: stories.length, videos: videoFiles.length, dryRun, uploaded }, null, 2));
