import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import sharp from "sharp";
import {
  belongsToExperiment,
  experimentImageMatchesPackage,
  parseExperimentImageName,
  resolveScienceSourceLayout,
  titleFromQuotedText,
} from "./science-source-layout.mjs";

const repoRoot = process.cwd();
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
const outputCatalog = path.join(repoRoot, "src", "data", "science-knowledge.json");
const outputAssetRoot = path.join(repoRoot, "public", "science-assets");
const outputExperimentAssetRoot = path.join(outputAssetRoot, "experiments");

const contentRoots = resolveScienceSourceLayout(sourceRoot);

const ageOrder = new Map([["托班", 0], ["小班", 1], ["中班", 2], ["大班", 3]]);

function comparePaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

async function walkFiles(directory, acceptedExtensions) {
  const extensions =
    acceptedExtensions instanceof Set
      ? acceptedExtensions
      : new Set(
          (Array.isArray(acceptedExtensions) ? acceptedExtensions : [acceptedExtensions]).map((extension) =>
            extension.toLocaleLowerCase("en-US"),
          ),
        );
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => comparePaths(left.name, right.name))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkFiles(filePath, extensions);
        return extensions.has(path.extname(entry.name).toLocaleLowerCase("en-US")) ? [filePath] : [];
      }),
  );

  return files.flat();
}

function relativeSourcePath(filePath) {
  return path.relative(sourceRoot, filePath).replaceAll("\\", "/");
}

function normalizeWhitespace(value) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownFromText(value) {
  return normalizeWhitespace(value)
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}

function excerptFromText(value) {
  const compact = normalizeWhitespace(value).replace(/\s+/g, " ");
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function stableId(prefix, sourceFile, title) {
  const digest = createHash("sha1").update(`${sourceFile}\u0000${title}`).digest("hex").slice(0, 12);
  return `${prefix}-${digest}`;
}

function titleFromExperimentFile(filePath) {
  return titleFromQuotedText(path.basename(filePath, path.extname(filePath)));
}

function imageRoleRank(role) {
  return { material: 0, operation: 1, legacy: 2, video: 3 }[role] ?? 4;
}

function imageResourceTitle(title, image, fallbackNumber) {
  const number = fallbackNumber ?? image?.number ?? 1;
  if (image?.role === "material") return `${title} · 材料准备 ${number}`;
  if (image?.role === "operation") return `${title} · 操作步骤 ${number}`;
  return `${title} · 实验图片 ${number}`;
}

// These source files are identical transparent transition artwork rather than experiment frames.
// Keep their source paths for provenance, but do not publish them as gallery steps.
function isExcludedExperimentImage(sourceImage) {
  const relativePath = relativeSourcePath(sourceImage.filePath);
  return (
    relativePath.includes("/水与液体/小班/") &&
    relativePath.includes("《自制泡泡液》") &&
    /(?:操作|实验步骤)(?:18|23|25|26)\.(?:png|jpe?g|webp)$/iu.test(relativePath)
  );
}

function sourceDetails(sourceFile, title, body, ageLabel, topic, category, resources = []) {
  const contentKey = `${title}\u0000${body}`;
  const baseId = stableId("BASE", sourceFile, contentKey);
  const normalizedResources = resources.map((resource, index) => ({
    ...resource,
    id: stableId("RESOURCE", `${sourceFile}\u0000${resource.filePath}`, `${contentKey}\u0000${resource.type}\u0000${index}`),
    knowledgeBaseId: baseId,
  }));

  return {
    id: stableId(category === "科学诗" ? "POEM" : category === "科学故事" ? "STORY" : "EXP", sourceFile, contentKey),
    baseId,
    semester: ageLabel,
    category,
    title,
    ageLabel,
    topic,
    author: "",
    sourceFile,
    sourcePage: "",
    allocationBasis: "按源材料目录中的主题和年龄段归档",
    tags: [category, topic, ageLabel],
    ingestStatus: "已导入本地材料",
    duplicateOf: "",
    knowledgeFile: sourceFile,
    imageCount: normalizedResources.filter((resource) => resource.type === "图片资源").length,
    videoUrl: normalizedResources.find((resource) => resource.type === "视频资源")?.externalUrl ?? "",
    excerpt: excerptFromText(body),
    body,
    resourceTypes: Array.from(new Set(normalizedResources.map((resource) => resource.type))),
    resources: normalizedResources,
  };
}

function extractAuthor(body) {
  const explicit = body.match(/(?:作者|作者\/收集者)[：:]\s*([^\n]{2,80})/u);
  if (explicit?.[1]) return explicit[1].trim();

  const parenthetical = body.match(/^\s*[（(]([^（）()\n]{2,80})[）)]\s*$/mu);
  return parenthetical?.[1].trim() ?? "";
}

async function extractRawText(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  return normalizeWhitespace(value);
}

function experimentSections(rawText, fallbackTitle) {
  const titlePattern = /^\s*(?:托班|小班|中班|大班)\s*科学(?:活动教案|实验)?\s*[：:]?\s*《\s*([^》\n]+?)\s*》\s*$/gmu;
  const matches = [...rawText.matchAll(titlePattern)];

  if (!matches.length) return [{ title: fallbackTitle, body: rawText }];

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? rawText.length;
    return { title, body: rawText.slice(start, end).trim() };
  });
}

async function collectExperimentImages() {
  const imageFiles = await walkFiles(contentRoots.experimentImages, [".png", ".jpg", ".jpeg", ".webp"]);
  const images = [];

  for (const sourceImage of imageFiles) {
    const relative = path.relative(contentRoots.experimentImages, sourceImage).split(path.sep);
    if (relative.length < 4) continue;

    const [topic, ageLabel, packageName] = relative;
    const title = titleFromQuotedText(packageName);
    if (!title || !ageOrder.has(ageLabel)) continue;

    const image = parseExperimentImageName(path.basename(sourceImage));
    if (!image) continue;
    if (!experimentImageMatchesPackage(path.basename(sourceImage), title)) continue;

    images.push({
      filePath: sourceImage,
      topic,
      ageLabel,
      packageTitle: title,
      ...image,
    });
  }

  return images.toSorted(
    (left, right) =>
      left.topic.localeCompare(right.topic, "zh-CN") ||
      ageOrder.get(left.ageLabel) - ageOrder.get(right.ageLabel) ||
      left.packageTitle.localeCompare(right.packageTitle, "zh-CN") ||
      imageRoleRank(left.role) - imageRoleRank(right.role) ||
      left.number - right.number ||
      comparePaths(left.filePath, right.filePath),
  );
}

function experimentImagesForSection(sourceImages, topic, ageLabel, title) {
  return sourceImages
    .filter(
      (image) =>
        image.topic === topic &&
        image.ageLabel === ageLabel &&
        belongsToExperiment(image, title, image),
    )
    .toSorted(
      (left, right) =>
        imageRoleRank(left.role) - imageRoleRank(right.role) ||
        left.number - right.number ||
        comparePaths(left.filePath, right.filePath),
    );
}

async function copyExperimentImage(sourceImage) {
  const extension = path.extname(sourceImage).toLocaleLowerCase("en-US");
  const digest = createHash("sha1").update(relativeSourcePath(sourceImage)).digest("hex").slice(0, 16);
  const outputName = `${digest}${extension}`;
  const target = path.join(outputExperimentAssetRoot, outputName);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(sourceImage, target);
  return `/science-assets/experiments/${outputName}`;
}

async function isGalleryImage(sourceImage, image = parseExperimentImageName(path.basename(sourceImage))) {
  if (image?.role === "video") return false;
  if (isExcludedExperimentImage({ filePath: sourceImage })) return false;
  const { width, height } = await sharp(sourceImage).metadata();
  const isQrCode = width === height && typeof width === "number" && width >= 290 && width <= 310;
  return !isQrCode;
}

async function buildExperiments(sourceImages) {
  const files = await walkFiles(contentRoots.experiments, ".docx");
  const items = [];

  for (const filePath of files) {
    const relative = path.relative(contentRoots.experiments, filePath).split(path.sep);
    const [topic, ageLabel] = relative;
    if (!topic || !ageOrder.has(ageLabel)) {
      throw new Error(`Unexpected experiment path: ${filePath}`);
    }

    const sourceFile = relativeSourcePath(filePath);
    const fallbackTitle = titleFromExperimentFile(filePath) || `${topic}科学实验`;
    const rawText = await extractRawText(filePath);
    const sections = experimentSections(rawText, fallbackTitle);

    for (const section of sections) {
      const baseId = stableId("BASE", sourceFile, section.title);
      const resources = [
        {
          id: stableId("GUIDE", sourceFile, section.title),
          type: "教案资源",
          knowledgeBaseId: baseId,
          semester: ageLabel,
          title: `${section.title} · 实验教案`,
          filePath: sourceFile,
          publicPath: "",
          externalUrl: "",
          source: sourceFile,
          isPublic: true,
        },
      ];

      const sectionImages = experimentImagesForSection(sourceImages, topic, ageLabel, section.title);
      const fallbackCounters = { material: 0, operation: 0, legacy: 0 };
      for (const sourceImage of sectionImages) {
        if (!(await isGalleryImage(sourceImage.filePath, sourceImage))) continue;
        fallbackCounters[sourceImage.role] = (fallbackCounters[sourceImage.role] ?? 0) + 1;
        resources.push({
          id: stableId("IMAGE", relativeSourcePath(sourceImage.filePath), section.title),
          type: "图片资源",
          knowledgeBaseId: baseId,
          semester: ageLabel,
          title: imageResourceTitle(
            section.title,
            sourceImage,
            fallbackCounters[sourceImage.role],
          ),
          filePath: relativeSourcePath(sourceImage.filePath),
          publicPath: await copyExperimentImage(sourceImage.filePath),
          externalUrl: "",
          source: relativeSourcePath(sourceImage.filePath),
          isPublic: true,
        });
      }

      const body = markdownFromText(section.body || rawText);
      const item = sourceDetails(sourceFile, section.title, body, ageLabel, topic, "科学实验", resources);
      item.author = extractAuthor(body);
      item.tags.push("教案", ...(resources.some((resource) => resource.type === "图片资源") ? ["图片"] : []));
      items.push(item);
    }
  }

  return items;
}

function sortCatalog(items) {
  const categoryOrder = new Map([["科学诗", 0], ["科学故事", 1], ["科学实验", 2]]);
  return items.sort((left, right) => {
    const categoryDifference = categoryOrder.get(left.category) - categoryOrder.get(right.category);
    if (categoryDifference) return categoryDifference;

    const topicDifference = left.topic.localeCompare(right.topic, "zh-CN");
    if (topicDifference) return topicDifference;

    const ageDifference = ageOrder.get(left.ageLabel) - ageOrder.get(right.ageLabel);
    if (ageDifference) return ageDifference;

    return left.title.localeCompare(right.title, "zh-CN");
  });
}

async function validateSourceDirectories() {
  for (const directory of [contentRoots.experiments, contentRoots.experimentImages]) {
    const stat = await fs.stat(directory).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Source directory is unavailable: ${directory}`);
  }
}

async function resetGeneratedAssets() {
  const relativeTarget = path.relative(repoRoot, outputExperimentAssetRoot);
  if (relativeTarget !== path.join("public", "science-assets", "experiments")) {
    throw new Error(`Refusing to reset an unexpected asset directory: ${outputExperimentAssetRoot}`);
  }
  await fs.rm(outputExperimentAssetRoot, { recursive: true, force: true });
}

async function main() {
  await validateSourceDirectories();
  const existingCatalog = JSON.parse(await fs.readFile(outputCatalog, "utf8"));
  await resetGeneratedAssets();

  const sourceImages = await collectExperimentImages();
  const experiments = await buildExperiments(sourceImages);
  const catalog = sortCatalog([
    ...existingCatalog.filter((item) => item.category !== "科学实验"),
    ...experiments,
  ]);

  if (!catalog.length) throw new Error("No science materials were imported");
  if (new Set(catalog.map((item) => item.id)).size !== catalog.length) {
    const duplicateIds = catalog
      .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) !== index)
      .map((item) => ({ id: item.id, title: item.title, sourceFile: item.sourceFile }));
    throw new Error(`Imported science materials contain duplicate IDs: ${JSON.stringify(duplicateIds)}`);
  }

  await fs.mkdir(path.dirname(outputCatalog), { recursive: true });
  await fs.writeFile(outputCatalog, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  const counts = Object.fromEntries(
    ["科学诗", "科学故事", "科学实验"].map((category) => [
      category,
      catalog.filter((item) => item.category === category).length,
    ]),
  );
  console.log(JSON.stringify({ sourceRoot, items: catalog.length, counts }, null, 2));
}

await main();
