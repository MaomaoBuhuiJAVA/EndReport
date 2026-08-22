import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const experimentAssetRoot = path.join(repoRoot, "public", "science-assets", "experiments");
const qrAssetRoot = path.join(repoRoot, "public", "science-assets", "video-qr");
const sourceRoot = path.resolve(process.env.SCIENCE_INCOMING_EXPERIMENTS_DIR || "");
const sourceLabel = process.env.SCIENCE_INCOMING_EXPERIMENTS_LABEL || "微信新增科学实验/8.22新增科学实验";
const dryRun = process.argv.includes("--dry-run");
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".avi"]);
const ageOrder = new Map([["托班", 0], ["小班", 1], ["中班", 2], ["大班", 3]]);

const topicByTitle = new Map([
  ["空气动力喷泉", "空气与气流动力"],
  ["会爬升的水", "空气与气流动力"],
  ["吸管抽水机", "空气与气流动力"],
  ["会跳舞的蛇", "空气与气流动力"],
  ["会跳高的乒乓球", "水与液体"],
  ["会漂浮的鸡蛋", "水与液体"],
  ["悬浮鸡蛋", "水与液体"],
  ["悬浮的鸡蛋", "水与液体"],
  ["水中烟花", "水与液体"],
]);

function comparePaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function stableId(prefix, source, value) {
  return `${prefix}-${createHash("sha1").update(`${source}\u0000${value}`).digest("hex").slice(0, 12)}`;
}

function titleFromQuotedText(value) {
  return value.match(/《\s*([^》]+?)\s*》/u)?.[1]?.trim() ?? "";
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLessonBody(value) {
  return normalizeWhitespace(value)
    .split("\n")
    .filter((line) => !/^\s*实验大玩家\s*[：:]/u.test(line))
    .join("\n")
    .trim();
}

function markdownFromText(value) {
  return cleanLessonBody(value)
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}

function excerptFromText(value) {
  const compact = cleanLessonBody(value).replace(/\s+/g, " ");
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
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

function sourceRelativePath(filePath) {
  return path.relative(sourceRoot, filePath).replaceAll("\\", "/");
}

function catalogSourcePath(filePath) {
  return `${sourceLabel}/${sourceRelativePath(filePath)}`;
}

function packageMetadata(directory) {
  const name = path.basename(directory);
  const title = titleFromQuotedText(name);
  const ageLabel = [...ageOrder.keys()].find((age) => name.includes(age)) ?? "";
  const topic = topicByTitle.get(title) ?? "";

  if (!title || !ageLabel || !topic) {
    throw new Error(`Unable to classify incoming experiment package: ${directory}`);
  }

  return { title, ageLabel, topic };
}

function imageDetails(filePath) {
  const extension = path.extname(filePath).toLocaleLowerCase("en-US");
  if (!imageExtensions.has(extension)) return null;

  const stem = path.basename(filePath, extension).trim();
  const roleMatchers = [
    ["video", /(?:视频资源|二维码)\s*(\d+)?\s*$/u],
    ["material", /(?:材料准备|准备材料)\s*(\d+)?\s*$/u],
    ["operation", /(?:实验步骤|操作)\s*(\d+)?\s*$/u],
    ["principle", /实验原理\s*(\d+)?\s*$/u],
  ];

  for (const [role, matcher] of roleMatchers) {
    const match = stem.match(matcher);
    if (match) return { role, number: Number(match[1] || 1) };
  }

  return { role: "image", number: 1 };
}

function imageRoleRank(role) {
  return { material: 0, operation: 1, principle: 2, image: 3, video: 4 }[role] ?? 5;
}

function imageResourceTitle(title, image, ordinal) {
  if (image.role === "material") return `${title} · 材料准备 ${ordinal}`;
  if (image.role === "operation") return `${title} · 操作步骤 ${ordinal}`;
  if (image.role === "principle") return `${title} · 实验原理`;
  return `${title} · 实验图片 ${ordinal}`;
}

async function copyPublicAsset(filePath, destinationRoot, publicPrefix) {
  const relativePath = catalogSourcePath(filePath);
  const extension = path.extname(filePath).toLocaleLowerCase("en-US");
  const fileName = `${createHash("sha1").update(relativePath).digest("hex").slice(0, 16)}${extension}`;
  const outputPath = path.join(destinationRoot, fileName);

  if (!dryRun) {
    await fs.mkdir(destinationRoot, { recursive: true });
    await fs.copyFile(filePath, outputPath);
  }

  return `${publicPrefix}/${fileName}`;
}

async function resourceList({ title, ageLabel, baseId, packageDirectory }) {
  const files = await walkFiles(packageDirectory);
  const images = files
    .map((filePath) => ({ filePath, image: imageDetails(filePath) }))
    .filter((entry) => entry.image !== null)
    .sort(
      (left, right) =>
        imageRoleRank(left.image.role) - imageRoleRank(right.image.role) ||
        left.image.number - right.image.number ||
        comparePaths(left.filePath, right.filePath),
    );
  const resources = [];
  const roleCounters = new Map();

  for (const entry of images) {
    const source = catalogSourcePath(entry.filePath);
    if (entry.image.role === "video") {
      resources.push({
        id: stableId("VIDEO", source, title),
        type: "视频资源",
        knowledgeBaseId: baseId,
        semester: ageLabel,
        title: `${title} · 视频资源 ${resources.filter((resource) => resource.type === "视频资源").length + 1}`,
        filePath: source,
        publicPath: await copyPublicAsset(entry.filePath, qrAssetRoot, "/science-assets/video-qr"),
        externalUrl: "",
        source,
        isPublic: true,
      });
      continue;
    }

    const displayRole = entry.image.role === "principle" ? "principle" : entry.image.role;
    const ordinal = (roleCounters.get(displayRole) ?? 0) + 1;
    roleCounters.set(displayRole, ordinal);
    resources.push({
      id: stableId("IMAGE", source, title),
      type: "图片资源",
      knowledgeBaseId: baseId,
      semester: ageLabel,
      title: imageResourceTitle(title, entry.image, ordinal),
      filePath: source,
      publicPath: await copyPublicAsset(entry.filePath, experimentAssetRoot, "/science-assets/experiments"),
      externalUrl: "",
      source,
      isPublic: true,
    });
  }

  return resources;
}

function createItem({ title, ageLabel, topic, sourceFile, body, resources, videoOnly = false }) {
  const baseId = stableId("BASE", sourceFile, title);
  const finalResources = resources.map((resource, index) => ({
    ...resource,
    id: resource.id || stableId("RESOURCE", resource.filePath, `${title}\u0000${index}`),
    knowledgeBaseId: baseId,
  }));
  const hasImages = finalResources.some((resource) => resource.type === "图片资源");
  const hasVideo = finalResources.some((resource) => resource.type === "视频资源");

  return {
    id: stableId("EXP", sourceFile, title),
    baseId,
    semester: ageLabel,
    category: "科学实验",
    title,
    ageLabel,
    topic,
    author: "",
    sourceFile,
    sourcePage: "",
    allocationBasis: "按 2026-08-22 新增科学实验资料的实验主题和年龄段归档",
    tags: ["科学实验", topic, ageLabel, ...(videoOnly ? ["视频素材"] : ["教案"]), ...(hasImages ? ["图片"] : []), ...(hasVideo ? ["视频"] : [])],
    ingestStatus: "已导入 2026-08-22 新增实验资料",
    duplicateOf: "",
    knowledgeFile: sourceFile,
    imageCount: finalResources.filter((resource) => resource.type === "图片资源").length,
    videoUrl: finalResources.find((resource) => resource.type === "视频资源")?.externalUrl ?? "",
    excerpt: excerptFromText(body),
    body,
    resourceTypes: Array.from(new Set(finalResources.map((resource) => resource.type))),
    resources: finalResources,
  };
}

function sortCatalog(items) {
  const categoryOrder = new Map([["科学诗", 0], ["科学故事", 1], ["科学实验", 2]]);
  return items.sort((left, right) => {
    const categoryDifference = categoryOrder.get(left.category) - categoryOrder.get(right.category);
    if (categoryDifference) return categoryDifference;
    const topicDifference = left.topic.localeCompare(right.topic, "zh-CN");
    if (topicDifference) return topicDifference;
    const ageDifference = (ageOrder.get(left.ageLabel) ?? 99) - (ageOrder.get(right.ageLabel) ?? 99);
    if (ageDifference) return ageDifference;
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

async function buildIncomingItems() {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const packages = entries
    .filter((entry) => entry.isDirectory() && titleFromQuotedText(entry.name))
    .map((entry) => path.join(sourceRoot, entry.name))
    .sort(comparePaths);
  const items = [];

  for (const packageDirectory of packages) {
    const metadata = packageMetadata(packageDirectory);
    const files = await walkFiles(packageDirectory);
    const plans = files.filter((filePath) => path.extname(filePath).toLocaleLowerCase("en-US") === ".docx");
    const videos = files.filter((filePath) => videoExtensions.has(path.extname(filePath).toLocaleLowerCase("en-US")));

    if (plans.length > 1) throw new Error(`Incoming experiment package has multiple plans: ${packageDirectory}`);

    if (plans.length) {
      const sourceFile = catalogSourcePath(plans[0]);
      const baseId = stableId("BASE", sourceFile, metadata.title);
      const resources = [
        {
          id: stableId("GUIDE", sourceFile, metadata.title),
          type: "教案资源",
          knowledgeBaseId: baseId,
          semester: metadata.ageLabel,
          title: `${metadata.title} · 实验教案`,
          filePath: sourceFile,
          publicPath: "",
          externalUrl: "",
          source: sourceFile,
          isPublic: true,
        },
        ...(await resourceList({ ...metadata, baseId, packageDirectory })),
      ];
      const { value } = await mammoth.extractRawText({ path: plans[0] });
      items.push(
        createItem({
          ...metadata,
          sourceFile,
          body: markdownFromText(value),
          resources,
        }),
      );
      continue;
    }

    if (!videos.length) throw new Error(`Incoming experiment package has no plan or video: ${packageDirectory}`);
    if (videos.length !== 1) throw new Error(`Incoming video-only package has multiple videos: ${packageDirectory}`);

    const sourceFile = catalogSourcePath(videos[0]);
    const baseId = stableId("BASE", sourceFile, metadata.title);
    items.push(
      createItem({
        ...metadata,
        sourceFile,
        body: "本条目当前收录实验视频素材。教案文本待补充后，可继续完善活动目标、材料准备和操作步骤。",
        videoOnly: true,
        resources: [
          {
            id: stableId("VIDEO", sourceFile, metadata.title),
            type: "视频资源",
            knowledgeBaseId: baseId,
            semester: metadata.ageLabel,
            title: `${metadata.title} · 视频资源 1`,
            filePath: sourceFile,
            publicPath: "",
            externalUrl: "",
            source: sourceFile,
            isPublic: true,
          },
        ],
      }),
    );
  }

  return items;
}

if (!sourceRoot || !fsSync.existsSync(sourceRoot)) {
  throw new Error("SCIENCE_INCOMING_EXPERIMENTS_DIR must point to the incoming experiment directory");
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const incomingItems = await buildIncomingItems();
const incomingKeys = new Set(incomingItems.map((item) => `${item.category}\u0000${item.ageLabel}\u0000${item.title}`));
const nextCatalog = sortCatalog([
  ...catalog.filter((item) => !incomingKeys.has(`${item.category}\u0000${item.ageLabel}\u0000${item.title}`)),
  ...incomingItems,
]);

if (!dryRun) await fs.writeFile(catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      sourceRoot,
      dryRun,
      imported: incomingItems.map((item) => ({
        title: item.title,
        ageLabel: item.ageLabel,
        topic: item.topic,
        images: item.imageCount,
        videos: item.resources.filter((resource) => resource.type === "视频资源").length,
        videoOnly: item.tags.includes("视频素材"),
      })),
      totalExperiments: nextCatalog.filter((item) => item.category === "科学实验").length,
    },
    null,
    2,
  ),
);
