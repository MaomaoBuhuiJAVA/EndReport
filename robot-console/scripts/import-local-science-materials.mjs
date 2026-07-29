import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import sharp from "sharp";

const repoRoot = process.cwd();
const defaultSourceRoot = path.resolve(repoRoot, "..", "..", "科学诗、科学故事、科学教案、科学实验");
const sourceRoot = path.resolve(process.env.SCIENCE_SOURCE_DIR || defaultSourceRoot);
const outputCatalog = path.join(repoRoot, "src", "data", "science-knowledge.json");
const outputAssetRoot = path.join(repoRoot, "public", "science-assets");

const contentRoots = {
  poetry: path.join(sourceRoot, "科学诗"),
  stories: path.join(sourceRoot, "科学故事"),
  experiments: path.join(sourceRoot, "科学实验教案"),
  experimentImages: path.join(sourceRoot, "科学实验图片资源", "科学教案"),
};

const ageOrder = new Map([["托班", 0], ["小班", 1], ["中班", 2], ["大班", 3]]);

function comparePaths(left, right) {
  return left.localeCompare(right, "zh-CN");
}

async function walkFiles(directory, acceptedExtension) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .sort((left, right) => comparePaths(left.name, right.name))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkFiles(filePath, acceptedExtension);
        return entry.name.toLocaleLowerCase("en-US").endsWith(acceptedExtension) ? [filePath] : [];
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

function imageKey(topic, ageLabel, title) {
  return [topic, ageLabel, title.trim()].join("\u0000");
}

function titleFromQuotedText(value) {
  const match = value.match(/《\s*([^》]+?)\s*》/u);
  return match?.[1].trim() ?? "";
}

function titleFromExperimentFile(filePath) {
  return titleFromQuotedText(path.basename(filePath, path.extname(filePath)));
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

function poemSections(rawText, fallbackTitle) {
  const titlePattern = /^\s*\d+\s*[.、]\s*《\s*([^》\n]+?)\s*》\s*$/gmu;
  const matches = [...rawText.matchAll(titlePattern)];

  if (!matches.length) return [{ title: fallbackTitle, body: rawText }];

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? rawText.length;
    return { title, body: rawText.slice(start, end).trim() };
  });
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
  const imageFiles = await walkFiles(contentRoots.experimentImages, ".png");
  const grouped = new Map();

  for (const sourceImage of imageFiles) {
    const relative = path.relative(contentRoots.experimentImages, sourceImage).split(path.sep);
    if (relative.length < 4) continue;

    const [topic, ageLabel, packageName] = relative;
    const title = titleFromQuotedText(packageName);
    if (!title || !ageOrder.has(ageLabel)) continue;

    const key = imageKey(topic, ageLabel, title);
    const images = grouped.get(key) ?? [];
    images.push(sourceImage);
    grouped.set(key, images);
  }

  return grouped;
}

async function copyExperimentImage(sourceImage) {
  const extension = path.extname(sourceImage).toLocaleLowerCase("en-US");
  const digest = createHash("sha1").update(relativeSourcePath(sourceImage)).digest("hex").slice(0, 16);
  const outputName = `${digest}${extension}`;
  const target = path.join(outputAssetRoot, "experiments", outputName);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(sourceImage, target);
  return `/science-assets/experiments/${outputName}`;
}

async function isGalleryImage(sourceImage) {
  const { width, height } = await sharp(sourceImage).metadata();
  const isQrCode = width === height && typeof width === "number" && width >= 290 && width <= 310;
  return !isQrCode;
}

async function buildPoems() {
  const files = await walkFiles(contentRoots.poetry, ".docx");
  const items = [];

  for (const filePath of files) {
    const relative = path.relative(contentRoots.poetry, filePath).split(path.sep);
    const [topic, ageLabel] = relative;
    if (!topic || !ageOrder.has(ageLabel)) {
      throw new Error(`Unexpected poetry path: ${filePath}`);
    }

    const sourceFile = relativeSourcePath(filePath);
    const rawText = await extractRawText(filePath);
    const fallbackTitle = `${topic}科学诗`;

    for (const section of poemSections(rawText, fallbackTitle)) {
      const body = markdownFromText(section.body || rawText);
      const documentResource = {
        id: stableId("DOC", sourceFile, section.title),
        type: "文档资源",
        knowledgeBaseId: stableId("BASE", sourceFile, section.title),
        semester: ageLabel,
        title: `${section.title} · 科学诗原稿`,
        filePath: sourceFile,
        publicPath: "",
        externalUrl: "",
        source: sourceFile,
        isPublic: true,
      };
      const item = sourceDetails(sourceFile, section.title, body, ageLabel, topic, "科学诗", [documentResource]);
      item.author = extractAuthor(body);
      if (item.author) item.tags.push(item.author);
      items.push(item);
    }
  }

  return items;
}

async function buildStories() {
  const files = await walkFiles(contentRoots.stories, ".mp4");
  const items = [];

  for (const filePath of files) {
    const relative = path.relative(contentRoots.stories, filePath).split(path.sep);
    const [topic, edition, ageLabel] = relative;
    if (!topic || !edition || !ageOrder.has(ageLabel)) {
      throw new Error(`Unexpected story path: ${filePath}`);
    }

    const sourceFile = relativeSourcePath(filePath);
    const stem = path.basename(filePath, path.extname(filePath));
    const title = titleFromQuotedText(stem) || stem;
    const performer = stem.replace(/^.*?》\s*/u, "").replace(/（第\d+期）$/u, "").trim();
    const body = [
      `## ${title}`,
      "",
      `本条为${edition}科学故事视频，适用${ageLabel}。`,
      "",
      `原始主题：${topic}`,
      performer ? `演绎/提供：${performer}` : "",
      "",
      "视频原文件已按本地资料目录归档；公开播放地址接入后可直接替换此资源链接。",
    ]
      .filter(Boolean)
      .join("\n");
    const videoResource = {
      id: stableId("VIDEO", sourceFile, title),
      type: "视频资源",
      knowledgeBaseId: stableId("BASE", sourceFile, title),
      semester: ageLabel,
      title: `${title} · ${edition}`,
      filePath: sourceFile,
      publicPath: "",
      externalUrl: "",
      source: sourceFile,
      isPublic: true,
    };
    const item = sourceDetails(sourceFile, title, body, ageLabel, topic, "科学故事", [videoResource]);
    item.author = performer;
    item.tags.push(edition, "视频");
    items.push(item);
  }

  return items;
}

async function buildExperiments(imagesByExperiment) {
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

      const sourceImages = imagesByExperiment.get(imageKey(topic, ageLabel, section.title)) ?? [];
      let galleryImageIndex = 0;
      for (const sourceImage of sourceImages) {
        if (!(await isGalleryImage(sourceImage))) continue;
        galleryImageIndex += 1;
        resources.push({
          id: stableId("IMAGE", relativeSourcePath(sourceImage), section.title),
          type: "图片资源",
          knowledgeBaseId: baseId,
          semester: ageLabel,
          title: `${section.title} · 图片 ${galleryImageIndex}`,
          filePath: relativeSourcePath(sourceImage),
          publicPath: await copyExperimentImage(sourceImage),
          externalUrl: "",
          source: relativeSourcePath(sourceImage),
          isPublic: true,
        });
      }

      const body = markdownFromText(section.body || rawText);
      const item = sourceDetails(sourceFile, section.title, body, ageLabel, topic, "科学实验", resources);
      item.author = extractAuthor(body);
      item.tags.push("教案", ...(sourceImages.length ? ["图片"] : []));
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
  for (const directory of Object.values(contentRoots)) {
    const stat = await fs.stat(directory).catch(() => null);
    if (!stat?.isDirectory()) throw new Error(`Source directory is unavailable: ${directory}`);
  }
}

async function resetGeneratedAssets() {
  const relativeTarget = path.relative(repoRoot, outputAssetRoot);
  if (relativeTarget !== path.join("public", "science-assets")) {
    throw new Error(`Refusing to reset an unexpected asset directory: ${outputAssetRoot}`);
  }
  await fs.rm(outputAssetRoot, { recursive: true, force: true });
}

async function main() {
  await validateSourceDirectories();
  await resetGeneratedAssets();

  const imagesByExperiment = await collectExperimentImages();
  const [poems, stories, experiments] = await Promise.all([
    buildPoems(),
    buildStories(),
    buildExperiments(imagesByExperiment),
  ]);
  const catalog = sortCatalog([...poems, ...stories, ...experiments]);

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
