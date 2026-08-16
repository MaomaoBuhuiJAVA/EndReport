import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const videoIndexRoot = path.resolve(
  process.env.SCIENCE_KNOWLEDGE_DIR || path.join(repoRoot, "..", "..", "国科二幼智能体知识库"),
);
const qrAssetRoot = path.join(repoRoot, "public", "science-assets", "video-qr");
const sourceRootCandidates = [
  process.env.SCIENCE_SOURCE_DIR,
  path.join(
    process.env.USERPROFILE || "",
    "Desktop",
    "科学诗、科学故事、科学教案、科学实验",
  ),
  path.resolve(repoRoot, "..", "..", "科学诗、科学故事、科学教案、科学实验"),
].filter(Boolean);
const sourceRoot = path.resolve(
  sourceRootCandidates.find((candidate) => fsSync.existsSync(candidate)) || sourceRootCandidates[0],
);
const experimentImageRoot = path.join(sourceRoot, "科学实验图片资源", "科学教案");

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

function sourceKey(topic, ageLabel, title) {
  return `${topic}\u0000${ageLabel}\u0000${title}`;
}

function imageTitleFromPackage(packageName) {
  return packageName.match(/《\s*([^》]+?)\s*》/u)?.[1].trim() ?? "";
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

async function sourceQrFiles() {
  const rootStat = await fs.stat(experimentImageRoot).catch(() => null);
  if (!rootStat?.isDirectory()) return new Map();

  const entries = await fs.readdir(experimentImageRoot, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => comparePaths(left.name, right.name))
      .map(async (entry) => {
        const entryPath = path.join(experimentImageRoot, entry.name);
        return entry.isDirectory() ? walkSourceQrFiles(entryPath) : [];
      }),
  );
  const grouped = new Map();
  for (const filePath of nested.flat()) {
    const relative = path.relative(experimentImageRoot, filePath).split(path.sep);
    if (relative.length < 4) continue;
    const [topic, ageLabel, packageName] = relative;
    const title = imageTitleFromPackage(packageName);
    if (!title) continue;
    const key = sourceKey(topic, ageLabel, title);
    const files = grouped.get(key) || [];
    files.push(filePath);
    grouped.set(key, files);
  }
  for (const files of grouped.values()) files.sort(comparePaths);
  return grouped;
}

async function walkSourceQrFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => comparePaths(left.name, right.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkSourceQrFiles(entryPath);
        return /视频资源\s*\d+\.(?:png|jpe?g|webp)$/iu.test(entry.name) ? [entryPath] : [];
      }),
  );
  return nested.flat();
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

async function copyProvidedQr(sourcePath) {
  const extension = path.extname(sourcePath).toLocaleLowerCase("en-US");
  const relative = path.relative(sourceRoot, sourcePath).replaceAll("\\", "/");
  const assetName = `${createHash("sha1").update(relative).digest("hex").slice(0, 16)}${extension}`;
  const outputPath = path.join(qrAssetRoot, assetName);
  await fs.copyFile(sourcePath, outputPath);
  return `/science-assets/video-qr/${assetName}`;
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const videosByTitle = await readExperimentVideos();
  const sourceQrs = await sourceQrFiles();
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

    const providedQrs = sourceQrs.get(sourceKey(item.topic, item.ageLabel, item.title)) ?? [];
    const existingVideoResources = item.resources.filter((resource) => resource.type === "视频资源");
    const videoResources = providedQrs.length
      ? await Promise.all(
          providedQrs.map(async (providedQr, index) => {
            const relativePath = path.relative(sourceRoot, providedQr).replaceAll("\\", "/");
            return {
              id:
                existingVideoResources[index]?.id ||
                resourceId(item, `source-qr:${relativePath}`),
              type: "视频资源",
              knowledgeBaseId: item.baseId,
              semester: item.semester,
              title: `${item.title} · 视频资源 ${index + 1}`,
              filePath: relativePath,
              publicPath: await copyProvidedQr(providedQr),
              externalUrl: index === 0 ? video.url : "",
              source: `${video.source}#${video.reference}`,
              isPublic: true,
            };
          }),
        )
      : [
          {
            id: existingVideoResources[0]?.id || resourceId(item, video.url),
            type: "视频资源",
            knowledgeBaseId: item.baseId,
            semester: item.semester,
            title: `${item.title} · 视频资源 1`,
            filePath: video.source,
            publicPath: await writeQrCode(video.url),
            externalUrl: video.url,
            source: `${video.source}#${video.reference}`,
            isPublic: true,
          },
        ];

    item.resources = [...item.resources.filter((resource) => resource.type !== "视频资源"), ...videoResources];
    item.resourceTypes = Array.from(new Set(item.resources.map((resource) => resource.type)));
    item.videoUrl = video.url;
    item.tags = Array.from(new Set([...item.tags, "视频"]));
  }

  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ experiments: experiments.length, videos: videosByTitle.size }, null, 2));
}

await main();
