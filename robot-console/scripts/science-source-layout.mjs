import fs from "node:fs";
import path from "node:path";

const experimentPlanDirectories = [
  ["科学教案纯文本", "科学实验教案"],
  ["科学实验教案"],
];

const experimentImageDirectories = [
  ["科学实验图片"],
  ["科学实验图片资源", "科学教案"],
];

const compositeBubbleLiquidAssignments = new Map([
  [
    "会爬升的彩虹",
    {
      material: [2],
      operation: [6, 7, 8, 9, 10],
      video: [2],
    },
  ],
  [
    "水上烟花",
    {
      material: [3],
      operation: [11, 12, 13, 14, 15, 16],
      video: [3],
    },
  ],
  [
    "神奇的彩色喷泉",
    {
      material: [5],
      operation: [24, 27, 28, 29],
      video: [5],
    },
  ],
  [
    "非牛顿流体",
    {
      material: [4],
      operation: [17, 19, 20, 21, 22],
      video: [4],
    },
  ],
  [
    "自制泡泡液",
    {
      material: [1],
      operation: [1, 2, 3, 4, 5],
      video: [1],
    },
  ],
]);

function firstExistingDirectory(sourceRoot, candidates) {
  return (
    candidates
      .map((segments) => path.join(sourceRoot, ...segments))
      .find((directory) => fs.existsSync(directory)) ?? path.join(sourceRoot, ...candidates[0])
  );
}

export function resolveScienceSourceLayout(sourceRoot) {
  return {
    poetry: path.join(sourceRoot, "科学诗"),
    stories: path.join(sourceRoot, "科学故事"),
    experiments: firstExistingDirectory(sourceRoot, experimentPlanDirectories),
    experimentImages: firstExistingDirectory(sourceRoot, experimentImageDirectories),
  };
}

export function titleFromQuotedText(value) {
  return value.match(/《\s*([^》]+?)\s*》/u)?.[1].trim() ?? "";
}

export function experimentImageMatchesPackage(fileName, packageTitle) {
  const fileTitle = titleFromQuotedText(fileName);
  return !fileTitle || fileTitle === packageTitle;
}

export function belongsToExperiment({ topic, ageLabel, packageTitle }, experimentTitle, image) {
  const isCompositeBubbleLiquidPackage =
    topic === "水与液体" && ageLabel === "小班" && packageTitle === "自制泡泡液";

  if (!isCompositeBubbleLiquidPackage) return packageTitle === experimentTitle;

  const assignment = compositeBubbleLiquidAssignments.get(experimentTitle);
  return Boolean(assignment?.[image.role]?.includes(image.number));
}

export function parseExperimentImageName(fileName) {
  const extension = path.extname(fileName).toLocaleLowerCase("en-US");
  if (!new Set([".png", ".jpg", ".jpeg", ".webp"]).has(extension)) return null;

  const stem = path.basename(fileName, extension).trim();
  const roles = [
    ["video", /(?:视频资源|二维码)\s*(\d+)?\s*$/u],
    ["material", /(?:材料准备|准备材料)\s*(\d+)?\s*$/u],
    ["operation", /(?:实验步骤|操作)\s*(\d+)?\s*$/u],
    ["legacy", /图片\s*(\d+)?\s*$/u],
  ];

  for (const [role, pattern] of roles) {
    const match = stem.match(pattern);
    if (match) return { role, number: Number(match[1] || 1) };
  }

  return null;
}
