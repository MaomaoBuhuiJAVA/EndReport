import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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

test("catalog keeps every activity and image from the experiment material packages", () => {
  const experiments = catalog.filter((item) => item.category === "科学实验");
  const imageCount = experiments.flatMap((item) => item.resources).filter((resource) => resource.type === "图片资源").length;

  assert.equal(experiments.length, 21);
  assert.ok(experiments.some((item) => item.title === "空气动力小汽车"));
  assert.equal(imageCount, 68);
});

test("catalog IDs are unique and every item has a source path", () => {
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length);
  assert.ok(catalog.every((item) => item.sourceFile));
});
