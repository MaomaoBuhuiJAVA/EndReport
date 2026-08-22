import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import QRCode from "qrcode";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const qrAssetRoot = path.join(repoRoot, "public", "science-assets", "video-qr");
const sourceRoot = path.resolve(process.env.SCIENCE_INCOMING_EXPERIMENTS_DIR || "");
const sourceLabel = process.env.SCIENCE_INCOMING_EXPERIMENTS_LABEL || "微信新增科学实验/8.22新增科学实验";
const dryRun = process.argv.includes("--dry-run");
const supportedVideo = /\.(mp4|webm|mov|m4v|avi)$/iu;

function tokenFromEnvFile(filePath) {
  try {
    const line = fsSync
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/u)
      .find((candidate) => candidate.startsWith("BLOB_READ_WRITE_TOKEN="));
    return line?.slice("BLOB_READ_WRITE_TOKEN=".length).trim().replace(/^['"]|['"]$/gu, "") ?? "";
  } catch {
    return "";
  }
}

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim()
  || tokenFromEnvFile(path.join(repoRoot, ".env.production.local"))
  || tokenFromEnvFile(path.join(repoRoot, ".env.local"))
  || tokenFromEnvFile(path.join(repoRoot, ".env.vercel.production"));

function sourceRelativePath(value) {
  const prefix = `${sourceLabel}/`;
  if (!value.startsWith(prefix)) throw new Error(`Video source is outside the incoming source label: ${value}`);
  return value.slice(prefix.length);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLocaleLowerCase("en-US");
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  return "video/mp4";
}

async function writeQrCode(videoUrl) {
  const outputName = `${createHash("sha1").update(videoUrl).digest("hex").slice(0, 16)}.png`;
  const outputPath = path.join(qrAssetRoot, outputName);
  if (!dryRun) {
    await fs.mkdir(qrAssetRoot, { recursive: true });
    await QRCode.toFile(outputPath, videoUrl, { errorCorrectionLevel: "M", margin: 1, width: 320 });
  }
  return `/science-assets/video-qr/${outputName}`;
}

if (!sourceRoot) throw new Error("SCIENCE_INCOMING_EXPERIMENTS_DIR must point to the incoming experiment directory");
if (!dryRun && !token) throw new Error("BLOB_READ_WRITE_TOKEN is required to upload incoming experiment videos");

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const uploaded = [];

for (const item of catalog.filter((entry) => entry.category === "科学实验" && entry.sourceFile.startsWith(`${sourceLabel}/`))) {
  const videoResources = item.resources.filter(
    (resource) => resource.type === "视频资源" && supportedVideo.test(resource.filePath),
  );

  for (const resource of videoResources) {
    const filePath = path.join(sourceRoot, ...sourceRelativePath(resource.filePath).split("/"));
    const overridePath = process.env.SCIENCE_INCOMING_VIDEO_PATH?.trim();
    const uploadPath = overridePath && item.title === "水中烟花" ? path.resolve(overridePath) : filePath;
    const stat = await fs.stat(uploadPath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Incoming video source is unavailable: ${uploadPath}`);

    const extension = path.extname(uploadPath).toLocaleLowerCase("en-US") || ".mp4";
    const pathname = `science-experiments/${item.id}${extension}`;
    const result = dryRun
      ? { url: `dry-run://${pathname}` }
      : await put(pathname, createReadStream(uploadPath), {
          access: "public",
          token,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: contentType(filePath),
          cacheControlMaxAge: 31536000,
          multipart: true,
        });
    const publicPath = await writeQrCode(result.url);

    resource.externalUrl = result.url;
    resource.publicPath = publicPath;
    item.videoUrl = result.url;
    item.tags = Array.from(new Set([...(item.tags || []), "视频"]));
    uploaded.push({ title: item.title, bytes: stat.size, url: result.url });
  }
}

if (!dryRun) await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ dryRun, videos: uploaded }, null, 2));
