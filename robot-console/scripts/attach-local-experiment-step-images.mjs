import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const stepImageRoot = path.join(repoRoot, "public", "knowledge");
const outputRoot = path.join(repoRoot, "public", "science-assets", "experiments");
const stepImageName = /^EXP-\d+_实验步骤图_(\d+)\.(?:png|jpe?g|webp)$/iu;

function comparePaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function stableId(prefix, source, title) {
  const digest = createHash("sha1").update(`${source}\u0000${title}`).digest("hex").slice(0, 12);
  return `${prefix}-${digest}`;
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

function sourcePath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function titleFromStepImage(filePath) {
  const packageName = path.basename(path.dirname(filePath));
  return packageName.match(/^EXP-\d+_(.+)$/u)?.[1].trim() ?? "";
}

async function publicImagePath(filePath) {
  const relativePath = sourcePath(filePath);
  const extension = path.extname(filePath).toLocaleLowerCase("en-US");
  const outputName = `${createHash("sha1").update(relativePath).digest("hex").slice(0, 16)}${extension}`;
  const target = path.join(outputRoot, outputName);

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.copyFile(filePath, target);
  return `/science-assets/experiments/${outputName}`;
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const sourceImages = (await walkFiles(stepImageRoot))
    .filter((filePath) => stepImageName.test(path.basename(filePath)))
    .map((filePath) => ({
      filePath,
      title: titleFromStepImage(filePath),
      step: Number(path.basename(filePath).match(stepImageName)?.[1] ?? 0),
    }))
    .filter((entry) => entry.title)
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN") || left.step - right.step);
  const sourceImagesByTitle = new Map();

  for (const entry of sourceImages) {
    const images = sourceImagesByTitle.get(entry.title) ?? [];
    images.push(entry);
    sourceImagesByTitle.set(entry.title, images);
  }

  const attached = [];
  for (const item of catalog.filter((entry) => entry.category === "科学实验")) {
    const hasPublicImage = item.resources.some(
      (resource) => resource.type === "图片资源" && resource.isPublic && resource.publicPath,
    );
    if (hasPublicImage) continue;

    const images = sourceImagesByTitle.get(item.title) ?? [];
    if (!images.length) {
      throw new Error(`Missing local step image for ${item.title}`);
    }

    const imageResources = await Promise.all(
      images.map(async (image, index) => {
        const filePath = sourcePath(image.filePath);
        return {
          id: stableId("RESOURCE", filePath, `${item.id}\u0000${index + 1}`),
          type: "图片资源",
          knowledgeBaseId: item.baseId,
          semester: item.semester,
          title: `${item.title} · 图片 ${index + 1}`,
          filePath,
          publicPath: await publicImagePath(image.filePath),
          externalUrl: "",
          source: filePath,
          isPublic: true,
        };
      }),
    );
    const videoIndex = item.resources.findIndex((resource) => resource.type === "视频资源");
    item.resources.splice(videoIndex < 0 ? item.resources.length : videoIndex, 0, ...imageResources);
    item.imageCount = item.resources.filter((resource) => resource.type === "图片资源").length;
    item.resourceTypes = Array.from(new Set(item.resources.map((resource) => resource.type)));
    if (!item.tags.includes("图片")) item.tags.push("图片");
    attached.push({ title: item.title, images: imageResources.length });
  }

  if (attached.length) {
    await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({ attached, count: attached.length }, null, 2));
}

await main();
