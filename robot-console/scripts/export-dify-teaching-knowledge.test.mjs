import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildDifyKnowledgeDocuments } from "./export-dify-teaching-knowledge.mjs";

const catalog = JSON.parse(
  fs.readFileSync(path.resolve("src/data/science-knowledge.json"), "utf8"),
);

test("builds deterministic age and category documents for the Dify dataset", () => {
  const result = buildDifyKnowledgeDocuments(catalog, "https://www.qyfck.icu");

  assert.equal(result.totalItems, 160);
  assert.deepEqual(result.documents.map((doc) => doc.fileName), [
    "科学诗-托班.md",
    "科学诗-小班.md",
    "科学诗-中班.md",
    "科学诗-大班.md",
    "科学故事-托班.md",
    "科学故事-小班.md",
    "科学故事-中班.md",
    "科学故事-大班.md",
    "科学实验-托班.md",
    "科学实验-小班.md",
    "科学实验-中班.md",
    "科学实验-大班.md",
    "多媒体资源索引.md",
  ]);

  const scienceExperimentDocument = result.documents.find(
    (document) => document.fileName === "科学实验-中班.md",
  );

  assert.ok(scienceExperimentDocument);
  assert.match(scienceExperimentDocument.content, /## 图片与视频资源/);
  assert.match(scienceExperimentDocument.content, /https:\/\/www\.qyfck\.icu\//);
  assert.match(scienceExperimentDocument.content, /年龄段：中班/);
  assert.match(scienceExperimentDocument.content, /\[LAB:EXP-/);
  for (const document of result.documents) {
    assert.doesNotMatch(document.content, /文本来源|教案原稿/);
  }
});

test("keeps media index links traceable to their source item", () => {
  const result = buildDifyKnowledgeDocuments(catalog, "https://www.qyfck.icu");
  const mediaIndex = result.documents.find(
    (document) => document.fileName === "多媒体资源索引.md",
  );

  assert.ok(mediaIndex);
  assert.match(mediaIndex.content, /资源索引/);
  assert.match(mediaIndex.content, /科学实验/);
  assert.match(mediaIndex.content, /二维码/);
  assert.match(mediaIndex.content, /\[RESOURCE:/);
});

test("preserves media resource order and labels each step in the media index", () => {
  const result = buildDifyKnowledgeDocuments(catalog, "https://www.qyfck.icu");
  const mediaIndex = result.documents.find(
    (document) => document.fileName === "多媒体资源索引.md",
  );
  assert.ok(mediaIndex);

  const rows = mediaIndex.content
    .split("\n")
    .filter((line) => line.includes("[LAB:EXP-0a9be04a415a]"));

  assert.deepEqual(
    rows.map((row) => row.match(/｜(?:图片资源|视频资源)（([^）]+)）/u)?.[1]),
    [
      "玩转纸片 · 材料准备 1",
      "玩转纸片 · 操作步骤 1",
      "玩转纸片 · 操作步骤 2",
      "玩转纸片 · 操作步骤 3",
      "玩转纸片 · 操作步骤 4",
      "玩转纸片 · 视频资源 1",
    ],
  );
});
