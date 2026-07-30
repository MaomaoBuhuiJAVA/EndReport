import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const videoIndexRoot = path.resolve(
  process.env.SCIENCE_KNOWLEDGE_DIR || path.join(repoRoot, "..", "..", "国科二幼智能体知识库"),
);
const qrAssetRoot = path.join(repoRoot, "public", "science-assets", "video-qr");

function comparePaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function videoAssetName(videoUrl) {
  return `${createHash("sha1").update(videoUrl).digest("hex").slice(0, 16)}.png`;
}

function resourceId(item, videoUrl) {
  return `VIDEO-${createHash("sha1")
    .update(`${item.baseId}\u0000${videoUrl}`)
    .digest("hex")
    .slice(0, 12)}`;
}

async function videoIndexFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => comparePaths(left.name, right.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return videoIndexFiles(entryPath);
        return entry.name === "README.md" && entryPath.includes(`${path.sep}视频资源${path.sep}`)
          ? [entryPath]
          : [];
      }),
  );

  return files.flat();
}

async function readExperimentVideos() {
  const files = await videoIndexFiles(videoIndexRoot);
  const entries = await Promise.all(
    files.map(async (filePath) => {
      const markdown = await fs.readFile(filePath, "utf8");
      return [...markdown.matchAll(/\[([^\]]+?)\s*-\s*视频链接\]\((https?:\/\/[^)\s]+)\)\s*`(EXP-\d+-VIDEO)`/g)].map(
        (match) => ({
          title: match[1].trim(),
          url: match[2],
          reference: match[3],
          source: path.relative(videoIndexRoot, filePath).replaceAll("\\", "/"),
        }),
      );
    }),
  );

  const byTitle = new Map();
  for (const entry of entries.flat()) {
    if (byTitle.has(entry.title)) throw new Error(`Duplicate video index title: ${entry.title}`);
    byTitle.set(entry.title, entry);
  }

  return byTitle;
}

async function writeQrCode(videoUrl) {
  const assetName = videoAssetName(videoUrl);
  const outputPath = path.join(qrAssetRoot, assetName);
  await QRCode.toFile(outputPath, videoUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  return `/science-assets/video-qr/${assetName}`;
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const videosByTitle = await readExperimentVideos();
  const experiments = catalog.filter((item) => item.category === "科学实验");

  if (experiments.length !== videosByTitle.size) {
    throw new Error(
      `Expected one video index entry per experiment, found ${experiments.length} experiments and ${videosByTitle.size} videos`,
    );
  }

  await fs.rm(qrAssetRoot, { recursive: true, force: true });
  await fs.mkdir(qrAssetRoot, { recursive: true });

  for (const item of experiments) {
    const video = videosByTitle.get(item.title);
    if (!video) throw new Error(`Video index is missing an entry for experiment: ${item.title}`);

    const videoResource = {
      id: item.resources.find((resource) => resource.type === "视频资源")?.id || resourceId(item, video.url),
      type: "视频资源",
      knowledgeBaseId: item.baseId,
      semester: item.semester,
      title: `${item.title} 视频`,
      filePath: video.source,
      publicPath: await writeQrCode(video.url),
      externalUrl: video.url,
      source: `${video.source}#${video.reference}`,
      isPublic: true,
    };

    item.resources = [...item.resources.filter((resource) => resource.type !== "视频资源"), videoResource];
    item.resourceTypes = Array.from(new Set(item.resources.map((resource) => resource.type)));
    item.videoUrl = video.url;
    item.tags = Array.from(new Set([...item.tags, "视频"]));
  }

  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ experiments: experiments.length, videos: videosByTitle.size }, null, 2));
}

await main();
