import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const catalogPath = path.resolve("src/data/science-knowledge.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

function preferredSourceRoot() {
  const candidates = [
    process.env.SCIENCE_SOURCE_DIR,
    path.join(
      process.env.USERPROFILE || "",
      "Desktop",
      "科学诗、科学故事、科学教案、科学实验",
    ),
    path.resolve("..", "..", "科学诗、科学故事、科学教案、科学实验"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

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
  const imageResources = experiments
    .flatMap((item) => item.resources)
    .filter((resource) => resource.type === "图片资源");
  const importedPackageImages = imageResources.filter((resource) =>
    resource.filePath.startsWith("科学实验图片资源/"),
  );
  const localStepImages = imageResources.filter((resource) =>
    resource.filePath.startsWith("public/knowledge/"),
  );

  assert.equal(experiments.length, 21);
  assert.ok(experiments.some((item) => item.title === "空气动力小汽车"));
  assert.equal(importedPackageImages.length, 125);
  assert.equal(localStepImages.length, 10);
  assert.equal(imageResources.length, importedPackageImages.length + localStepImages.length);
});

test("every experiment has at least one public step image for the detail view", () => {
  const experiments = catalog.filter((item) => item.category === "科学实验");
  const missingStepImages = experiments
    .filter(
      (item) =>
        !item.resources.some(
          (resource) =>
            resource.type === "图片资源" &&
            resource.isPublic &&
            resource.publicPath.startsWith("/science-assets/experiments/"),
        ),
    )
    .map((item) => item.title);

  assert.deepEqual(missingStepImages, []);
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

test("source experiment packages keep their provided QR image instead of a generated placeholder", () => {
  const sourceRoot = preferredSourceRoot();
  assert.ok(sourceRoot, "science source directory is required for QR provenance checks");
  const imageRoot = path.join(sourceRoot, "科学实验图片资源", "科学教案");
  const sourcePackages = [];

  for (const imagePath of walkPngFiles(imageRoot)) {
    if (!/视频资源\d+\.png$/u.test(path.basename(imagePath))) continue;
    const [topic, ageLabel, packageName] = path.relative(imageRoot, imagePath).split(path.sep);
    sourcePackages.push({ topic, ageLabel, title: imageTitleFromPackage(packageName), imagePath });
  }

  assert.equal(sourcePackages.length, 21);
  const packagesByExperiment = new Map();
  for (const entry of sourcePackages) {
    const key = `${entry.topic}\u0000${entry.ageLabel}\u0000${entry.title}`;
    const images = packagesByExperiment.get(key) ?? [];
    images.push(entry.imagePath);
    packagesByExperiment.set(key, images);
  }

  let sourceBackedQrCount = 0;
  for (const [key, sourceQrImages] of packagesByExperiment) {
    const [topic, ageLabel, title] = key.split("\u0000");
    const item = catalog.find(
      (entry) =>
        entry.category === "科学实验" &&
        entry.topic === topic &&
        entry.ageLabel === ageLabel &&
        entry.title === title,
    );
    assert.ok(item, `catalog is missing ${topic}/${ageLabel}/${title}`);
    const videos = item.resources.filter((resource) => resource.type === "视频资源");
    assert.equal(videos.length, sourceQrImages.length, `${title} should retain every provided QR image`);
    assert.ok(videos.every((video) => video.filePath.startsWith("科学实验图片资源/")));
    sourceBackedQrCount += videos.length;

    const copiedHashes = new Set(
      videos.map((video) => {
        const copiedQr = path.resolve("public", video.publicPath.replace(/^\//u, ""));
        return createHash("sha256").update(fs.readFileSync(copiedQr)).digest("hex");
      }),
    );
    const sourceHashes = new Set(
      sourceQrImages.map((sourceQr) => createHash("sha256").update(fs.readFileSync(sourceQr)).digest("hex")),
    );
    assert.deepEqual(copiedHashes, sourceHashes, `${title} should retain its complete QR set`);
  }
  assert.equal(sourceBackedQrCount, 21);
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
  const sourceRoot = preferredSourceRoot();
  assert.ok(sourceRoot);
  const imageRoot = path.join(sourceRoot, "科学实验图片资源", "科学教案");
  const imagesByExperiment = new Map();

  for (const imagePath of walkPngFiles(imageRoot)) {
    if (!(await isGalleryImage(imagePath))) continue;

    const [topic, ageLabel, packageName] = path.relative(imageRoot, imagePath).split(path.sep);
    const title = imageTitleFromPackage(packageName);
    assert.ok(title, `experiment image package is missing a quoted title: ${imagePath}`);

    const key = `${topic}\u0000${ageLabel}\u0000${title}`;
    const files = imagesByExperiment.get(key) ?? [];
    const fileName = path.basename(imagePath);
    const material = fileName.match(/材料准备(\d+)\.png$/u);
    const operation = fileName.match(/操作(\d+)\.png$/u);
    files.push({
      path: path.relative(sourceRoot, imagePath).replaceAll("\\", "/"),
      role: material ? "材料准备" : operation ? "操作步骤" : "实验图片",
      number: Number(material?.[1] ?? operation?.[1] ?? files.length + 1),
    });
    imagesByExperiment.set(key, files);
  }

  for (const [key, expectedImages] of imagesByExperiment) {
    const [topic, ageLabel, title] = key.split("\u0000");
    const matches = catalog.filter(
      (item) =>
        item.category === "科学实验" && item.topic === topic && item.ageLabel === ageLabel && item.title === title,
    );
    assert.equal(matches.length, 1, `expected exactly one catalog experiment for ${topic}/${ageLabel}/${title}`);

    const imageResources = matches[0].resources.filter(
      (resource) => resource.type === "图片资源" && resource.isPublic,
    );
    const expected = expectedImages
      .toSorted((left, right) =>
        left.role === right.role ? left.number - right.number : left.role === "材料准备" ? -1 : 1,
      );
    assert.deepEqual(
      imageResources.map((resource) => resource.filePath),
      expected.map((image) => image.path),
      `${title} image resources should retain their source step order`,
    );
    assert.deepEqual(
      imageResources.map((resource) => resource.title),
      expected.map((image) => `${title} · ${image.role} ${image.number}`),
      `${title} image labels should describe the source role and order`,
    );
  }
});

test("source image roles become meaningful catalog labels in material-first order", async () => {
  const sourceRoot = preferredSourceRoot();
  assert.ok(sourceRoot);
  const imageRoot = path.join(sourceRoot, "科学实验图片资源", "科学教案");
  const sourceImagesByExperiment = new Map();

  for (const imagePath of walkPngFiles(imageRoot)) {
    const fileName = path.basename(imagePath);
    const roleMatch = fileName.match(/(材料准备|操作)(\d+)\.png$/u);
    if (!roleMatch) continue;

    const [topic, ageLabel, packageName] = path.relative(imageRoot, imagePath).split(path.sep);
    const title = imageTitleFromPackage(packageName);
    assert.ok(title, `experiment image package is missing a quoted title: ${imagePath}`);

    const key = `${topic}\u0000${ageLabel}\u0000${title}`;
    const images = sourceImagesByExperiment.get(key) ?? [];
    images.push({
      source: path.relative(sourceRoot, imagePath).replaceAll("\\", "/"),
      role: roleMatch[1],
      number: Number(roleMatch[2]),
    });
    sourceImagesByExperiment.set(key, images);
  }

  assert.equal(sourceImagesByExperiment.size, 11);
  assert.equal(
    [...sourceImagesByExperiment.values()].reduce((total, images) => total + images.length, 0),
    125,
  );

  for (const [key, expectedImages] of sourceImagesByExperiment) {
    const [topic, ageLabel, title] = key.split("\u0000");
    const item = catalog.find(
      (entry) =>
        entry.category === "科学实验" &&
        entry.topic === topic &&
        entry.ageLabel === ageLabel &&
        entry.title === title,
    );
    assert.ok(item, `catalog is missing ${topic}/${ageLabel}/${title}`);

    const expected = expectedImages
      .toSorted((left, right) =>
        left.role === right.role ? left.number - right.number : left.role === "材料准备" ? -1 : 1,
      )
      .map((entry) => ({
        source: entry.source,
        title: `${title} · ${entry.role === "材料准备" ? "材料准备" : "操作步骤"} ${entry.number}`,
      }));
    const actual = item.resources
      .filter((resource) => resource.type === "图片资源" && resource.filePath.startsWith("科学实验图片资源/"))
      .map((resource) => ({ source: resource.filePath, title: resource.title }));

    assert.deepEqual(actual, expected, `${title} should retain role-aware source order and labels`);
  }
});
