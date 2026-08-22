import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const staticVideoRoot = path.join(repoRoot, "public", "science-assets", "videos");
const qrRoot = path.join(repoRoot, "public", "science-assets", "video-qr");
const videoSource = path.resolve(process.env.SCIENCE_INCOMING_VIDEO_PATH || "");
const publicBaseUrl = String(process.env.SCIENCE_PUBLIC_BASE_URL || "https://www.qyfck.icu").replace(/\/+$/u, "");
const videoFileName = "incoming-water-fireworks-720p.mp4";
const publicVideoPath = `/science-assets/videos/${videoFileName}`;
const title = "水中烟花";

if (!videoSource) throw new Error("SCIENCE_INCOMING_VIDEO_PATH must point to the compressed MP4");
const stat = await fs.stat(videoSource).catch(() => null);
if (!stat?.isFile()) throw new Error(`Static video source is unavailable: ${videoSource}`);

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const item = catalog.find((entry) => entry.category === "科学实验" && entry.title === title && entry.ageLabel === "小班");
if (!item) throw new Error(`Cannot find ${title} in the science catalog`);

const videoUrl = `${publicBaseUrl}${publicVideoPath}`;
await fs.mkdir(staticVideoRoot, { recursive: true });
await fs.mkdir(qrRoot, { recursive: true });
await fs.copyFile(videoSource, path.join(staticVideoRoot, videoFileName));

const qrFileName = "incoming-water-fireworks.png";
await QRCode.toFile(path.join(qrRoot, qrFileName), videoUrl, {
  errorCorrectionLevel: "M",
  margin: 1,
  width: 320,
});

const videoResource = item.resources.find((resource) => resource.type === "视频资源");
if (!videoResource) throw new Error(`${title} has no video resource`);
videoResource.externalUrl = videoUrl;
videoResource.publicPath = `/science-assets/video-qr/${qrFileName}`;
item.videoUrl = videoUrl;
item.tags = Array.from(new Set([...(item.tags || []), "视频"]));

await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ title, bytes: stat.size, videoUrl, qrPath: videoResource.publicPath }, null, 2));
