import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { loadNativeUploadEnv, ossUploadClient, putPrivateMedia } from "./lib/native-uploads.mjs";
await loadNativeUploadEnv();
import QRCode from "qrcode";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const qrAssetRoot = path.join(repoRoot, "public", "science-assets", "video-qr");
const sourceRoot = path.resolve(process.env.SCIENCE_INCOMING_EXPERIMENTS_DIR || "");
const sourceLabel = process.env.SCIENCE_INCOMING_EXPERIMENTS_LABEL || "微信新增科学实验/8.22新增科学实验";
const dryRun = process.argv.includes("--dry-run");
const supportedVideo = /\.(mp4|webm|mov|m4v|avi)$/iu;

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
    await QRCode.toFile(outputPath, new URL(videoUrl, process.env.SITE_URL).toString(), { errorCorrectionLevel: "M", margin: 1, width: 320 });
  }
  return `/science-assets/video-qr/${outputName}`;
}

if (!sourceRoot) throw new Error("SCIENCE_INCOMING_EXPERIMENTS_DIR must point to the incoming experiment directory");
if (!dryRun) {ossUploadClient(); if (!process.env.SITE_URL) throw new Error("SITE_URL is required for website video QR codes");}

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
      : await putPrivateMedia(pathname, createReadStream(uploadPath), {

          contentType: contentType(filePath),

        });
    const publicPath = await writeQrCode(result.url);

    resource.externalUrl = result.url;
    resource.publicPath = publicPath;
    item.videoUrl = result.url;
    item.tags = Array.from(new Set([...(item.tags || []), "视频"]));
    uploaded.push({ id: item.id, title: item.title, bytes: stat.size, url: result.url });
  }
}

if (!dryRun) await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ dryRun, videos: uploaded,
  ...(!dryRun ? {databaseSyncPending: true, syncCommand: `npm run sync:science-media -- --item=${[...new Set(uploaded.map(item => item.id))].join(",")} --catalog='${catalogPath.replaceAll("'", "''")}'`} : {}),
}, null, 2));
