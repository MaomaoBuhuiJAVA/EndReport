import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const catalogPath = path.resolve("src/data/science-knowledge.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

test("catalog uses the three canonical resource types", () => {
  assert.deepEqual(
    Array.from(new Set(catalog.map((item) => item.category))).sort(),
    ["科学实验", "科学故事", "科学诗"],
  );
});

test("catalog normalizes every item to a supported age group", () => {
  const allowedAges = new Set(["托班", "小班", "中班", "大班"]);
  assert.ok(catalog.length > 0);
  assert.ok(catalog.every((item) => allowedAges.has(item.ageLabel)));
});

test("catalog includes real story records from the new source materials", () => {
  const stories = catalog.filter((item) => item.category === "科学故事");
  assert.ok(stories.length > 0);
  assert.ok(stories.every((item) => item.resources.some((resource) => resource.type === "视频资源")));
});

test("corrects 会变色的小水滴 to the water and weather topic without losing its source path", () => {
  const story = catalog.find((item) => item.title === "会变色的小水滴");

  assert.ok(story);
  assert.equal(story.category, "科学故事");
  assert.equal(story.topic, "水科学与气象自然");
  assert.ok(story.tags.includes("水科学与气象自然"));
  assert.ok(!story.tags.includes("动物生活习性认知"));
  assert.match(story.body, /展示主题：水科学与气象自然/u);
  assert.match(story.excerpt, /展示主题：水科学与气象自然/u);
  assert.ok(!story.body.includes("原始主题：动物生活习性认知"));
  assert.equal(
    story.sourceFile,
    "科学故事/动物生活习性认知/教师版/中班/《会变色的小水滴》杨海倩老师（第13期）.mp4",
  );
  assert.equal(story.resources[0]?.source, story.sourceFile);
});

test("catalog keeps every activity and image from the experiment material packages", () => {
  const experiments = catalog.filter((item) => item.category === "科学实验");
  const imageCount = experiments.flatMap((item) => item.resources).filter((resource) => resource.type === "图片资源").length;

  assert.equal(experiments.length, 21);
  assert.ok(experiments.some((item) => item.title === "空气动力小汽车"));
  assert.equal(imageCount, 68);
});

test("every experiment keeps its playable video link and scannable QR code", () => {
  const experiments = catalog.filter((item) => item.category === "科学实验");
  const videoResources = experiments.map((item) =>
    item.resources.find((resource) => resource.type === "视频资源"),
  );

  assert.equal(videoResources.length, 21);
  assert.ok(videoResources.every(Boolean));
  assert.ok(videoResources.every((resource) => resource.externalUrl.startsWith("http")));
  assert.ok(videoResources.every((resource) => resource.publicPath.startsWith("/science-assets/video-qr/")));
  assert.ok(
    videoResources.every((resource) =>
      fs.existsSync(path.resolve("public", resource.publicPath.replace(/^\//, ""))),
    ),
  );
});

test("catalog IDs are unique and every item has a source path", () => {
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
  assert.ok(catalog.every((item) => item.sourceFile));
});

function compareNaturalPaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function walkPngFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareNaturalPaths(left.name, right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkPngFiles(entryPath) : entry.name.toLowerCase().endsWith(".png") ? [entryPath] : [];
    });
}

function imageTitleFromPackage(packageName) {
  return packageName.match(/《\s*([^》]+?)\s*》/u)?.[1].trim() ?? "";
}

async function isGalleryImage(filePath) {
  const { width, height } = await sharp(filePath).metadata();
  return !(width === height && typeof width === "number" && width >= 290 && width <= 310);
}

test("accepted source experiment images map to matching catalog records in numeric source order", async () => {
  const sourceRoot = path.resolve("..", "..", "科学诗、科学故事、科学教案、科学实验");
  const imageRoot = path.join(sourceRoot, "科学实验图片资源", "科学教案");
  const imagesByExperiment = new Map();

  for (const imagePath of walkPngFiles(imageRoot)) {
    if (!(await isGalleryImage(imagePath))) continue;

    const [topic, ageLabel, packageName] = path.relative(imageRoot, imagePath).split(path.sep);
    const title = imageTitleFromPackage(packageName);
    assert.ok(title, `experiment image package is missing a quoted title: ${imagePath}`);

    const key = `${topic}\u0000${ageLabel}\u0000${title}`;
    const files = imagesByExperiment.get(key) ?? [];
    files.push(path.relative(sourceRoot, imagePath).replaceAll("\\", "/"));
    imagesByExperiment.set(key, files);
  }

  for (const [key, expectedPaths] of imagesByExperiment) {
    const [topic, ageLabel, title] = key.split("\u0000");
    const matches = catalog.filter(
      (item) =>
        item.category === "科学实验" && item.topic === topic && item.ageLabel === ageLabel && item.title === title,
    );
    assert.equal(matches.length, 1, `expected exactly one catalog experiment for ${topic}/${ageLabel}/${title}`);

    const imageResources = matches[0].resources.filter(
      (resource) => resource.type === "图片资源" && resource.isPublic,
    );
    assert.deepEqual(
      imageResources.map((resource) => resource.filePath),
      expectedPaths,
      `${title} image resources should retain their source step order`,
    );
    assert.deepEqual(
      imageResources.map((resource) => resource.title),
      expectedPaths.map((_, index) => `${title} · 图片 ${index + 1}`),
      `${title} image labels should describe the displayed step order`,
    );
  }
});
