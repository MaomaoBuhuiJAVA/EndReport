import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  belongsToExperiment,
  experimentImageMatchesPackage,
  parseExperimentImageName,
  resolveScienceSourceLayout,
} from "./science-source-layout.mjs";

function sourceRoot() {
  const candidates = [
    process.env.SCIENCE_SOURCE_DIR,
    path.resolve("..", "..", "科学诗、科学故事、科学教案、科学实验"),
    path.join(
      process.env.USERPROFILE || "",
      "Desktop",
      "科学诗、科学故事、科学教案、科学实验",
    ),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

test("resolves the reorganized local teaching-plan and image roots", () => {
  const root = sourceRoot();
  assert.ok(root, "science source directory is required");

  const layout = resolveScienceSourceLayout(root);
  assert.equal(
    path.relative(root, layout.experiments).replaceAll("\\", "/"),
    "科学教案纯文本/科学实验教案",
  );
  assert.equal(path.relative(root, layout.experimentImages).replaceAll("\\", "/"), "科学实验图片");
});

test("classifies reorganized experiment image names by their display role", () => {
  assert.deepEqual(parseExperimentImageName("大班科学教案《神奇的热气球》实验步骤4.png"), {
    role: "operation",
    number: 4,
  });
  assert.deepEqual(parseExperimentImageName("中三班科学实验《水油分离实验》材料准备.jpg"), {
    role: "material",
    number: 1,
  });
  assert.deepEqual(parseExperimentImageName("中三班科学实验《神奇泡泡实验》二维码.jpg"), {
    role: "video",
    number: 1,
  });
});

test("ignores an image whose own title conflicts with its package title", () => {
  assert.equal(
    experimentImageMatchesPackage("中班科学教案《火焰掌》操作2.png", "碘伏变变变"),
    false,
  );
  assert.equal(
    experimentImageMatchesPackage("中班科学教案《碘伏变变变》视频资源1.png", "碘伏变变变"),
    true,
  );
});

test("splits the composite bubble-liquid image package by its numbered experiment sections", () => {
  const packageInfo = {
    topic: "水与液体",
    ageLabel: "小班",
    packageTitle: "自制泡泡液",
  };

  assert.equal(
    belongsToExperiment(packageInfo, "会爬升的彩虹", { role: "operation", number: 6 }),
    true,
  );
  assert.equal(
    belongsToExperiment(packageInfo, "会爬升的彩虹", { role: "operation", number: 5 }),
    false,
  );
  assert.equal(
    belongsToExperiment(packageInfo, "水上烟花", { role: "material", number: 3 }),
    true,
  );
  assert.equal(
    belongsToExperiment(packageInfo, "神奇的彩色喷泉", { role: "operation", number: 27 }),
    true,
  );
  assert.equal(
    belongsToExperiment(packageInfo, "非牛顿流体", { role: "video", number: 4 }),
    true,
  );
  assert.equal(
    belongsToExperiment(packageInfo, "自制泡泡液", { role: "operation", number: 18 }),
    false,
  );
});
