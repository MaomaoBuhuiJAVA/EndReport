import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtemp, writeFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {planScienceMediaSync, applyScienceMediaSync} from "./science-media-sync.mjs";

const upload = "/api/media/uploads/science-stories/unique-STORY-1.mp4";
const cover = "/api/media/uploads/science-story-covers/unique-STORY-1.png";
const catalog = [{
  id: "STORY-1", baseId: "BASE-1", title: "小水滴", videoUrl: upload,
  resources: [
    {id: "VIDEO-1", knowledgeBaseId: "BASE-1", type: "视频资源", title: "小水滴 · 视频", externalUrl: upload, publicPath: "/science-assets/video-qr/water.png", isPublic: true},
    {id: "COVER-1", knowledgeBaseId: "BASE-1", type: "图片资源", title: "小水滴 · 封面", externalUrl: cover, publicPath: cover, isPublic: true},
    {id: "OLD-1", knowledgeBaseId: "BASE-1", type: "文档资源", externalUrl: "https://example.com/old.docx", isPublic: true},
  ],
}, {id: "STORY-2", baseId: "BASE-2", videoUrl: "/api/media/uploads/science-stories/other.mp4", resources: []}];

test("plans only the explicitly selected uploaded media, retaining the existing video QR path", () => {
  const plan = planScienceMediaSync(catalog, ["STORY-1"]);
  assert.deepEqual(plan.map(item => item.id), ["STORY-1"]);
  assert.equal(plan[0].videoUrl, upload);
  assert.deepEqual(plan[0].resources.map(resource => resource.id), ["VIDEO-1", "COVER-1"]);
  assert.equal(plan[0].resources[0].publicPath, "/science-assets/video-qr/water.png");
  assert.throws(() => planScienceMediaSync(catalog, []), /explicit|指定/iu);
  assert.throws(() => planScienceMediaSync(catalog, ["UNKNOWN"]), /UNKNOWN/u);
});

test("does not register a student-work upload or a path with encoded traversal", () => {
  for (const privateUrl of ["/api/media/uploads/student-works/parent/photo.png", "/api/media/uploads/science-story-covers/%2e%2e/private.png"]) {
    const plan = planScienceMediaSync([{...catalog[0], videoUrl: privateUrl, resources: [{...catalog[0].resources[1], publicPath: privateUrl, externalUrl: privateUrl}]}], ["STORY-1"]);
    assert.ok(plan[0], "the explicit item must remain in the plan");
    assert.equal(plan[0].videoUrl, undefined);
    assert.deepEqual(plan[0].resources, []);
  }
});

function database() {
  const items = new Map([
    ["STORY-1", {id: "STORY-1", baseId: "BASE-1", title: "教师修改后的标题", body: "教师保存的正文", videoUrl: "old.mp4", imageCount: 0}],
    ["USER-1", {id: "USER-1", baseId: "USER-BASE", body: "用户新增内容"}],
  ]);
  const resources = new Map([
    ["VIDEO-1", {id: "VIDEO-1", knowledgeBaseId: "BASE-1", resourceType: "视频资源", title: "教师修改后的视频", externalUrl: "old.mp4", isPublic: false}],
    ["PRIVATE-1", {id: "PRIVATE-1", knowledgeBaseId: "BASE-1", resourceType: "图片资源", isPublic: false}],
    ["USER-RESOURCE", {id: "USER-RESOURCE", knowledgeBaseId: "USER-BASE", title: "用户新增素材", isPublic: true}],
  ]);
  const tx = {
    scienceKnowledgeItem: {
      findUnique: async ({where}) => items.get(where.id) ?? null,
      update: async ({where, data}) => {Object.assign(items.get(where.id), data);},
    },
    scienceKnowledgeResource: {
      findUnique: async ({where}) => resources.get(where.id) ?? null,
      upsert: async ({where, create, update}) => {
        if (resources.has(where.id)) Object.assign(resources.get(where.id), update);
        else resources.set(where.id, {...create});
      },
      count: async ({where}) => [...resources.values()].filter(resource => resource.knowledgeBaseId === where.knowledgeBaseId && resource.resourceType === where.resourceType && resource.isPublic === where.isPublic).length,
    },
  };
  return {items, resources, client: {$transaction: async callback => callback(tx)}};
}

test("registers only media references without reseeding user rows, changing text, or promoting private resources", async () => {
  const db = database();
  const result = await applyScienceMediaSync(db.client, planScienceMediaSync(catalog, ["STORY-1"]));
  assert.deepEqual(result, {items: 1, resources: 2});
  assert.equal(db.items.get("STORY-1").videoUrl, upload);
  assert.equal(db.items.get("STORY-1").imageCount, 1);
  assert.equal(db.items.get("STORY-1").body, "教师保存的正文");
  assert.equal(db.items.get("STORY-1").title, "教师修改后的标题");
  assert.equal(db.resources.get("VIDEO-1").externalUrl, upload);
  assert.equal(db.resources.get("VIDEO-1").isPublic, false);
  assert.equal(db.resources.get("VIDEO-1").title, "教师修改后的视频");
  assert.equal(db.resources.get("COVER-1").publicPath, cover);
  assert.equal(db.resources.get("COVER-1").isPublic, true);
  assert.deepEqual(db.items.get("USER-1"), {id: "USER-1", baseId: "USER-BASE", body: "用户新增内容"});
  assert.equal(db.resources.get("USER-RESOURCE").title, "用户新增素材");
});

test("refuses an unknown item or mismatched resource owner before applying any changes", async () => {
  for (const mismatch of ["missing-item", "resource-owner"]) {
    const db = database();
    if (mismatch === "missing-item") db.items.delete("STORY-1");
    else db.resources.get("VIDEO-1").knowledgeBaseId = "UNRELATED-BASE";
    await assert.rejects(applyScienceMediaSync(db.client, planScienceMediaSync(catalog, ["STORY-1"])), /missing|belong|不存在|归属/iu);
    assert.equal(db.resources.get("VIDEO-1").externalUrl, "old.mp4");
    assert.equal(db.resources.has("COVER-1"), false);
  }
});

test("CLI preview reads the uploader's custom catalogue from local configuration without a database", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "science-media-sync-"));
  try {
    await writeFile(path.join(root, "custom-catalog.json"), JSON.stringify(catalog));
    await writeFile(path.join(root, ".env.local"), "SCIENCE_CATALOG_PATH=custom-catalog.json\n");
    const env = {...process.env, DATABASE_URL: "invalid-placeholder"};
    delete env.SCIENCE_CATALOG_PATH;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../sync-science-media.mjs", import.meta.url)), "--item=STORY-1"], {cwd: root, env, encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.applied, false);
    assert.equal(output.plans[0].videoUrl, upload);
    assert.equal(output.plans[0].resources.length, 2);
    await writeFile(path.join(root, ".env.local"), "SCIENCE_CATALOG_PATH=nonexistent.json\n");
    const explicit = spawnSync(process.execPath, [fileURLToPath(new URL("../sync-science-media.mjs", import.meta.url)), "--item=STORY-1", "--catalog=custom-catalog.json"], {cwd: root, env, encoding: "utf8"});
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(JSON.parse(explicit.stdout).plans[0].videoUrl, upload);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("science-media-sync-"));
    await rm(root, {recursive: true, force: true});
  }
});
