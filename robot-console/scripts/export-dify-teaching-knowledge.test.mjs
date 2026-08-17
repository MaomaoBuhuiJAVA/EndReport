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

  assert.equal(result.totalItems, 163);
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

  const paperActivity = catalog.find(
    (item) => item.category === "科学实验" && item.title === "玩转纸片",
  );
  assert.ok(paperActivity);

  const rows = mediaIndex.content
    .split("\n")
    .filter((line) => line.includes(`[LAB:${paperActivity.id}]`));

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

test("redacts classroom attribution, signatures, and contact details without removing teaching or media references", () => {
  const sensitiveItem = {
    id: "LAB-REDACTION-CONTRACT",
    baseId: "BASE-REDACTION-CONTRACT",
    category: "科学实验",
    ageLabel: "大班",
    topic: "空气",
    title: "空气在哪里",
    tags: ["科学实验", "大班", "第3班 张小明"],
    body: [
      "第3班 张小明完成了材料观察。",
      "作者：李老师",
      "作者 李教授",
      "署名：王小红",
      "【英国】克里斯蒂娜【译】马 丽",
      "联系电话：13800138000",
      "身份证号：11010519491231002X",
      "邮箱：teacher@example.com",
      "微信号：wxid_kexiaobei",
      "QQ：12345678",
      "（中二班 林\n\n千里；）",
      "中二班林千里 科学原理：空气具有流动性。",
      "教学正文：请幼儿观察气球在空气中飘动。",
    ].join("\n"),
    excerpt: "教学正文：请幼儿观察气球在空气中飘动。",
    resources: [
      {
        id: "RESOURCE-REDACTION-IMAGE",
        type: "图片资源",
        title: "空气实验步骤图",
        publicPath: "/science-assets/redaction-contract.png",
      },
      {
        id: "RESOURCE-REDACTION-VIDEO",
        type: "视频资源",
        title: "空气实验视频",
        publicPath: "/science-assets/redaction-contract-qr.png",
        externalUrl: "https://video.example.test/air-contract",
      },
    ],
  };

  const result = buildDifyKnowledgeDocuments([sensitiveItem], "https://www.qyfck.icu");
  const exportedText = result.documents.map((document) => document.content).join("\n");

  assert.doesNotMatch(exportedText, /第3班|张小明|中二班|林千里|作者(?:：|\s)|李老师|李教授|署名：|王小红|克里斯蒂娜|马 丽/);
  assert.doesNotMatch(exportedText, /13800138000|11010519491231002X|teacher@example\.com|wxid_kexiaobei|QQ：12345678/);
  assert.match(exportedText, /年龄段：大班/);
  assert.match(exportedText, /\[LAB:LAB-REDACTION-CONTRACT\]/);
  assert.match(exportedText, /\[BASE:BASE-REDACTION-CONTRACT\]/);
  assert.match(exportedText, /《空气在哪里》/);
  assert.match(exportedText, /科学原理：空气具有流动性。/);
  assert.match(exportedText, /教学正文：请幼儿观察气球在空气中飘动。/);
  assert.match(exportedText, /https:\/\/www\.qyfck\.icu\/science-assets\/redaction-contract\.png/);
  assert.match(exportedText, /https:\/\/video\.example\.test\/air-contract/);
});
