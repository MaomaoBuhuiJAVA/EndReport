import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import {
  belongsToExperiment,
  experimentImageMatchesPackage,
  parseExperimentImageName,
  resolveScienceSourceLayout,
  titleFromQuotedText,
} from "./science-source-layout.mjs";

const repoRoot = process.cwd();
const catalogPath = path.resolve(
  process.env.SCIENCE_CATALOG_PATH || path.join(repoRoot, "src", "data", "science-knowledge.json"),
);
const videoIndexRoot = path.resolve(
  process.env.SCIENCE_KNOWLEDGE_DIR || path.join(repoRoot, "..", "..", "国科二幼智能体知识库"),
);
const qrAssetRoot = path.resolve(
  process.env.SCIENCE_QR_ASSET_DIR || path.join(repoRoot, "public", "science-assets", "video-qr"),
);
const sourceRootCandidates = [
  process.env.SCIENCE_SOURCE_DIR,
  path.resolve(repoRoot, "..", "..", "科学诗、科学故事、科学教案、科学实验"),
  path.join(
    process.env.USERPROFILE || "",
    "Desktop",
    "科学诗、科学故事、科学教案、科学实验",
  ),
].filter(Boolean);
const sourceRoot = path.resolve(
  sourceRootCandidates.find((candidate) => fsSync.existsSync(candidate)) || sourceRootCandidates[0],
);
const { experimentImages: experimentImageRoot } = resolveScienceSourceLayout(sourceRoot);

function comparePaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000]+/gu, "")
    .replace(/[《》“”"'`]/gu, "")
    .trim();
}

function videoAssetName(videoUrl) {
  return `${createHash("sha1").update(videoUrl).digest("hex").slice(0, 16)}.png`;
}

function resourceId(item, source) {
  return `VIDEO-${createHash("sha1")
    .update(`${item.baseId}\u0000${source}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function sourceRelativePath(filePath) {
  return path.relative(sourceRoot, filePath).replaceAll("\\", "/");
}

async function videoIndexFiles(directory) {
  const stat = await fs.stat(directory).catch(() => null);
  if (!stat?.isDirectory()) return [];

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

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .sort((left, right) => comparePaths(left.name, right.name))
      .map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
      }),
  );
  return nested.flat();
}

async function sourceQrFiles() {
  const rootStat = await fs.stat(experimentImageRoot).catch(() => null);
  if (!rootStat?.isDirectory()) return [];

  const sourceFiles = await walkFiles(experimentImageRoot);
  const qrs = [];
  for (const filePath of sourceFiles) {
    const relative = path.relative(experimentImageRoot, filePath).split(path.sep);
    if (relative.length < 4) continue;

    const [topic, ageLabel, packageName] = relative;
    const packageTitle = titleFromQuotedText(packageName);
    const image = parseExperimentImageName(path.basename(filePath));
    if (!packageTitle || image?.role !== "video") continue;
    if (!experimentImageMatchesPackage(path.basename(filePath), packageTitle)) continue;

    qrs.push({
      topic,
      ageLabel,
      packageTitle,
      filePath,
      image,
    });
  }

  return qrs.sort((left, right) => {
    const topicOrder = comparePaths(left.topic, right.topic);
    if (topicOrder) return topicOrder;
    const ageOrder = comparePaths(left.ageLabel, right.ageLabel);
    if (ageOrder) return ageOrder;
    const packageOrder = comparePaths(left.packageTitle, right.packageTitle);
    if (packageOrder) return packageOrder;
    const numberOrder = left.image.number - right.image.number;
    return numberOrder || comparePaths(left.filePath, right.filePath);
  });
}

function sourceQrsForExperiment(sourceQrs, item) {
  return sourceQrs
    .filter(
      (sourceQr) =>
        sourceQr.topic === item.topic &&
        sourceQr.ageLabel === item.ageLabel &&
        belongsToExperiment(sourceQr, item.title, sourceQr.image),
    )
    .sort((left, right) => left.image.number - right.image.number || comparePaths(left.filePath, right.filePath));
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
    const key = normalizeTitle(entry.title);
    if (byTitle.has(key)) throw new Error(`Duplicate video index title: ${entry.title}`);
    byTitle.set(key, entry);
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
  const relative = sourceRelativePath(sourcePath);
  const assetName = `${createHash("sha1").update(relative).digest("hex").slice(0, 16)}${extension}`;
  const outputPath = path.join(qrAssetRoot, assetName);
  await fs.copyFile(sourcePath, outputPath);
  return `/science-assets/video-qr/${assetName}`;
}

function sourceReference(video, sourcePath) {
  if (!video) return sourcePath;
  return `${video.source}#${video.reference}; ${sourcePath}`;
}

async function videoResourcesForExperiment(item, sourceQrs, video) {
  if (sourceQrs.length) {
    return Promise.all(
      sourceQrs.map(async (providedQr, index) => {
        const relativePath = sourceRelativePath(providedQr.filePath);
        return {
          id: resourceId(item, `source-qr:${relativePath}`),
          type: "视频资源",
          knowledgeBaseId: item.baseId,
          semester: item.semester,
          title: `${item.title} · 视频资源 ${index + 1}`,
          filePath: relativePath,
          publicPath: await copyProvidedQr(providedQr.filePath),
          externalUrl: index === 0 ? video?.url || "" : "",
          source: sourceReference(video, relativePath),
          isPublic: true,
        };
      }),
    );
  }

  if (!video) return [];
  return [
    {
      id: resourceId(item, `generated-qr:${video.url}`),
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
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const videosByTitle = await readExperimentVideos();
  const sourceQrs = await sourceQrFiles();
  const experiments = catalog.filter((item) => item.category === "科学实验");
  const missingIndexedVideos = [];

  await fs.rm(qrAssetRoot, { recursive: true, force: true });
  await fs.mkdir(qrAssetRoot, { recursive: true });

  for (const item of experiments) {
    const video = videosByTitle.get(normalizeTitle(item.title));
    const itemSourceQrs = sourceQrsForExperiment(sourceQrs, item);
    const videoResources = await videoResourcesForExperiment(item, itemSourceQrs, video);

    item.resources = [...item.resources.filter((resource) => resource.type !== "视频资源"), ...videoResources];
    item.resourceTypes = Array.from(new Set(item.resources.map((resource) => resource.type)));
    item.videoUrl = video?.url || "";
    item.tags = Array.from(
      new Set([
        ...(item.tags || []).filter((tag) => tag !== "视频"),
        ...(videoResources.length ? ["视频"] : []),
      ]),
    );

    if (!video) missingIndexedVideos.push(item.title);
  }

  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        experiments: experiments.length,
        indexedVideos: videosByTitle.size,
        sourceQrs: sourceQrs.length,
        missingIndexedVideos,
      },
      null,
      2,
    ),
  );
}

await main();
