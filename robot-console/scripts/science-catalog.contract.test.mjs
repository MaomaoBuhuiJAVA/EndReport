import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const catalogPath = path.resolve("src/data/science-knowledge.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const sourceRoot = path.resolve("E:\\国科二幼\\科学诗、科学故事、科学教案、科学实验");
const experimentPlanRoot = path.join(sourceRoot, "科学教案纯文本", "科学实验教案");
const experimentImageRoot = path.join(sourceRoot, "科学实验图片");

const unsupportedExternalVideoTitles = new Set([
  "神奇的毛细现象",
  "神奇泡泡实验",
  "水油分离实验",
]);

const bubbleLessonTitle = "自制泡泡液";
const bubbleLessonSourceFile =
  "科学教案纯文本/科学实验教案/水与液体/小班/小班科学实验《自制泡泡液》.docx";
const bubbleImageAssignments = {
  自制泡泡液: {
    material: [1],
    operation: [1, 2, 3, 4, 5],
    video: [1],
  },
  会爬升的彩虹: {
    material: [2],
    operation: [6, 7, 8, 9, 10],
    video: [2],
  },
  水上烟花: {
    material: [3],
    operation: [11, 12, 13, 14, 15, 16],
    video: [3],
  },
  非牛顿流体: {
    material: [4],
    operation: [17, 19, 20, 21, 22],
    video: [4],
  },
  神奇的彩色喷泉: {
    material: [5],
    operation: [24, 27, 28, 29],
    video: [5],
  },
};

function compareNaturalPaths(left, right) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

function walkFiles(directory, include) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareNaturalPaths(left.name, right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(entryPath, include) : include(entryPath) ? [entryPath] : [];
    });
}

function sourcePath(filePath) {
  return path.relative(sourceRoot, filePath).replaceAll("\\", "/");
}

function titleFromQuotedText(value) {
  return value.match(/《\s*([^》]+?)\s*》/u)?.[1].trim() ?? "";
}

function parseExperimentImageName(filePath) {
  const extension = path.extname(filePath).toLocaleLowerCase("en-US");
  if (!new Set([".png", ".jpg", ".jpeg", ".webp"]).has(extension)) return null;

  const stem = path.basename(filePath, extension).trim();
  const roles = [
    ["video", /(?:视频资源|二维码)\s*(\d+)?\s*$/u],
    ["material", /(?:材料准备|准备材料)\s*(\d+)?\s*$/u],
    ["operation", /(?:实验步骤|操作)\s*(\d+)?\s*$/u],
  ];

  for (const [role, pattern] of roles) {
    const match = stem.match(pattern);
    if (match) return { role, number: Number(match[1] || 1) };
  }

  return null;
}

function experimentImageEntries() {
  return walkFiles(experimentImageRoot, (filePath) => parseExperimentImageName(filePath) !== null).map((filePath) => {
    const relative = path.relative(experimentImageRoot, filePath).split(path.sep);
    assert.equal(relative.length, 4, `unexpected experiment image layout: ${filePath}`);

    const [sourceTopic, ageLabel, packageName, fileName] = relative;
    const packageTitle = titleFromQuotedText(packageName);
    const fileTitle = titleFromQuotedText(fileName);
    const image = parseExperimentImageName(filePath);
    assert.ok(packageTitle, `experiment image package is missing a quoted title: ${filePath}`);

    return {
      ageLabel,
      fileName,
      filePath,
      fileTitle,
      packageTitle,
      source: sourcePath(filePath),
      sourceTopic,
      ...image,
    };
  });
}

function imageMatchesPackage(entry) {
  return !entry.fileTitle || entry.fileTitle === entry.packageTitle;
}

function isDecorativeBubbleFrame(entry) {
  return (
    entry.packageTitle === bubbleLessonTitle &&
    entry.role === "operation" &&
    new Set([18, 23, 25, 26]).has(entry.number)
  );
}

function assignedExperimentTitle(entry) {
  if (entry.packageTitle !== bubbleLessonTitle) return entry.packageTitle;

  const title = Object.entries(bubbleImageAssignments).find(([, assignment]) =>
    assignment[entry.role]?.includes(entry.number),
  )?.[0];
  assert.ok(title, `unassigned ${bubbleLessonTitle} ${entry.role} ${entry.number}: ${entry.filePath}`);
  return title;
}

function byTitle(title, ageLabel) {
  const matches = catalog.filter(
    (item) =>
      item.category === "科学实验" &&
      item.title === title &&
      (ageLabel === undefined || item.ageLabel === ageLabel),
  );
  assert.equal(matches.length, 1, `expected exactly one experiment for ${ageLabel ?? "任意年龄"}/${title}`);
  return matches[0];
}

function imageRoleLabel(role) {
  return role === "material" ? "材料准备" : "操作步骤";
}

function sourceImageOrder(left, right) {
  const roleRank = { material: 0, operation: 1, video: 2 };
  return (
    roleRank[left.role] - roleRank[right.role] ||
    left.number - right.number ||
    compareNaturalPaths(left.source, right.source)
  );
}

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

test("science experiments bind explicitly to the supplied E: source layout", () => {
  assert.equal(path.resolve(process.env.SCIENCE_SOURCE_DIR || sourceRoot), sourceRoot);
  assert.ok(fs.existsSync(experimentPlanRoot), `missing teaching-plan root: ${experimentPlanRoot}`);
  assert.ok(fs.existsSync(experimentImageRoot), `missing experiment-image root: ${experimentImageRoot}`);
});

test("science experiment catalog contains the 24 source plans and no old experiment paths", () => {
  const experiments = catalog.filter((item) => item.category === "科学实验");
  const sourceDocuments = walkFiles(experimentPlanRoot, (filePath) => filePath.toLowerCase().endsWith(".docx"));
  const sourceDocumentPaths = sourceDocuments.map(sourcePath).sort(compareNaturalPaths);
  const catalogDocumentPaths = Array.from(new Set(experiments.map((item) => item.sourceFile))).sort(compareNaturalPaths);

  assert.equal(sourceDocuments.length, 20);
  assert.equal(experiments.length, 24);
  assert.ok(
    experiments.every((item) => item.sourceFile.startsWith("科学教案纯文本/科学实验教案/")),
    "all experiment text must come from the reorganized teaching-plan tree",
  );
  assert.deepEqual(catalogDocumentPaths, sourceDocumentPaths);

  assert.deepEqual(
    experiments.map((item) => item.title).sort(compareNaturalPaths),
    [
      "会变魔术的温度计",
      "会游的纸鱼",
      "会爬升的彩虹",
      "人造雪",
      "奇妙的饮水机",
      "水上烟花",
      "水油分离实验",
      "水陆空气动力船",
      "空气动力小汽车",
      "空气炮",
      "玩转纸片",
      "生气的河豚",
      "盐水发电风扇",
      "神奇泡泡实验",
      "神奇的太阳能直升机",
      "神奇的毛细现象",
      "神奇的热气球",
      "神奇的火山喷发",
      "神奇的彩色喷泉",
      "碘伏变变变",
      "自制泡泡液",
      "萤火虫流星雨",
      "火焰掌",
      "非牛顿流体",
    ].sort(compareNaturalPaths),
  );
});

test("the five bubble-liquid activities split one source document without losing their age", () => {
  for (const title of Object.keys(bubbleImageAssignments)) {
    const item = byTitle(title, "小班");
    assert.equal(item.sourceFile, bubbleLessonSourceFile);
  }
});

test("all accepted source images keep source order, source paths, and role-aware labels", () => {
  const expectedByTitle = new Map();
  const entries = experimentImageEntries();
  const rejectedMismatches = entries.filter(
    (entry) => entry.role !== "video" && !imageMatchesPackage(entry),
  );

  assert.equal(rejectedMismatches.length, 5);
  assert.ok(
    rejectedMismatches.every(
      (entry) => entry.packageTitle === "碘伏变变变" && entry.fileTitle === "火焰掌",
    ),
  );

  for (const entry of entries) {
    if (entry.role === "video" || !imageMatchesPackage(entry) || isDecorativeBubbleFrame(entry)) continue;
    const title = assignedExperimentTitle(entry);
    const images = expectedByTitle.get(title) ?? [];
    images.push(entry);
    expectedByTitle.set(title, images);
  }

  const expectedImageCount = Array.from(expectedByTitle.values()).flat().length;
  assert.equal(expectedByTitle.size, 23);
  assert.equal(expectedImageCount, 131);

  const experiments = catalog.filter((item) => item.category === "科学实验");
  const catalogImages = experiments.flatMap((item) =>
    item.resources.filter((resource) => resource.type === "图片资源"),
  );
  assert.equal(catalogImages.length, expectedImageCount);
  assert.ok(catalogImages.every((resource) => resource.filePath.startsWith("科学实验图片/")));
  assert.ok(catalogImages.every((resource) => resource.isPublic));
  assert.ok(catalogImages.every((resource) => resource.publicPath.startsWith("/science-assets/experiments/")));

  for (const [title, sourceImages] of expectedByTitle) {
    const item = byTitle(title, Object.hasOwn(bubbleImageAssignments, title) ? "小班" : undefined);
    const roleCounters = new Map();
    const expected = sourceImages.toSorted(sourceImageOrder).map((entry) => {
      const roleLabel = imageRoleLabel(entry.role);
      const displayNumber = (roleCounters.get(roleLabel) ?? 0) + 1;
      roleCounters.set(roleLabel, displayNumber);
      return {
        filePath: entry.source,
        title: `${title} · ${roleLabel} ${displayNumber}`,
      };
    });
    const actual = item.resources
      .filter((resource) => resource.type === "图片资源")
      .map((resource) => ({ filePath: resource.filePath, title: resource.title }));

    assert.deepEqual(actual, expected, `${title} should retain its accepted source image order`);
  }
});

test("碘伏变变变 rejects misplaced 火焰掌 images instead of pooling them into the experiment", () => {
  const item = byTitle("碘伏变变变", "中班");
  const imageResources = item.resources.filter((resource) => resource.type === "图片资源");

  assert.deepEqual(imageResources, []);
  assert.ok(item.resources.every((resource) => !resource.filePath.includes("火焰掌")));
});

test("the four decorative bubble-liquid frames are omitted and the remaining steps are renumbered", () => {
  const excludedSourceNames = ["操作18.png", "操作23.png", "操作25.png", "操作26.png"];

  for (const title of Object.keys(bubbleImageAssignments)) {
    const item = byTitle(title, "小班");
    const images = item.resources.filter((resource) => resource.type === "图片资源");
    const operationImages = images.filter((resource) => resource.title.includes("操作步骤"));

    assert.ok(
      operationImages.every((resource) => !excludedSourceNames.some((name) => resource.filePath.endsWith(name))),
      `${title} must not retain decorative transition frames`,
    );
    assert.deepEqual(
      operationImages.map((resource) => resource.title),
      operationImages.map((_, index) => `${title} · 操作步骤 ${index + 1}`),
      `${title} operation labels should be contiguous after excluded frames`,
    );
  }
});

test("every experiment keeps its source QR image and only known videos expose an external link", () => {
  const entries = experimentImageEntries().filter((entry) => entry.role === "video" && imageMatchesPackage(entry));
  const expectedByTitle = new Map();

  for (const entry of entries) {
    const title = assignedExperimentTitle(entry);
    const videos = expectedByTitle.get(title) ?? [];
    videos.push(entry);
    expectedByTitle.set(title, videos);
  }

  assert.equal(entries.length, 24);
  assert.equal(expectedByTitle.size, 24);

  const experiments = catalog.filter((item) => item.category === "科学实验");
  const catalogVideos = experiments.flatMap((item) =>
    item.resources.filter((resource) => resource.type === "视频资源"),
  );
  assert.equal(catalogVideos.length, 24);
  assert.ok(catalogVideos.every((resource) => resource.filePath.startsWith("科学实验图片/")));
  assert.ok(catalogVideos.every((resource) => resource.publicPath.startsWith("/science-assets/video-qr/")));

  const sourceHashes = entries.map((entry) => hashFile(entry.filePath)).sort();
  const copiedHashes = catalogVideos
    .map((resource) => hashFile(path.resolve("public", resource.publicPath.replace(/^\//u, ""))))
    .sort();
  assert.deepEqual(copiedHashes, sourceHashes);

  for (const [title, sourceVideos] of expectedByTitle) {
    const item = byTitle(title, Object.hasOwn(bubbleImageAssignments, title) ? "小班" : undefined);
    const actualVideos = item.resources.filter((resource) => resource.type === "视频资源");
    assert.equal(actualVideos.length, sourceVideos.length, `${title} should retain its source QR image`);
    assert.deepEqual(
      actualVideos.map((resource) => resource.filePath),
      sourceVideos.toSorted(sourceImageOrder).map((entry) => entry.source),
      `${title} should not receive another experiment's QR image`,
    );

    for (const video of actualVideos) {
      const copiedQr = path.resolve("public", video.publicPath.replace(/^\//u, ""));
      assert.ok(fs.existsSync(copiedQr), `missing copied QR image: ${video.publicPath}`);
      if (unsupportedExternalVideoTitles.has(title)) {
        assert.equal(video.externalUrl, "", `${title} has no verified external video URL`);
      } else {
        assert.match(video.externalUrl, /^https?:\/\//u, `${title} should retain its verified external video URL`);
      }
    }
  }

  const noExternalLinkTitles = experiments
    .filter((item) => item.resources.some((resource) => resource.type === "视频资源" && resource.externalUrl === ""))
    .map((item) => item.title)
    .sort(compareNaturalPaths);
  assert.deepEqual(noExternalLinkTitles, Array.from(unsupportedExternalVideoTitles).sort(compareNaturalPaths));
});

test("catalog IDs are unique and every item has a source path", () => {
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
  assert.ok(catalog.every((item) => item.sourceFile));
});
