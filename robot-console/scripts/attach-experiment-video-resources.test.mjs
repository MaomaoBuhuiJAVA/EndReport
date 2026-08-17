import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./attach-experiment-video-resources.mjs", import.meta.url));
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function experiment(title, { topic = "水与液体", ageLabel = "中班", baseId } = {}) {
  return {
    id: `EXP-${baseId}`,
    baseId: `BASE-${baseId}`,
    title,
    category: "科学实验",
    topic,
    ageLabel,
    semester: "中班下册",
    tags: [topic, ageLabel],
    resources: [],
    resourceTypes: [],
    videoUrl: "",
  };
}

async function writeFixtureFile(root, relativePath, contents = "fixture") {
  const filePath = path.join(root, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
  return filePath;
}

function runAttachment(env) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("keeps authoritative source QR files when indexed experiment URLs are unavailable", async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "science-video-attachment-"));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));

  const sourceRoot = path.join(fixtureRoot, "source");
  const catalogPath = path.join(fixtureRoot, "science-knowledge.json");
  const videoIndexRoot = path.join(fixtureRoot, "video-index");
  const qrAssetRoot = path.join(fixtureRoot, "video-qr");
  const compositePackage = "科学实验图片/水与液体/小班/小班科学教案《自制泡泡液》图片";

  await writeFixtureFile(sourceRoot, `${compositePackage}/小班科学教案《自制泡泡液》视频资源1.png`, "bubble");
  await writeFixtureFile(sourceRoot, `${compositePackage}/小班科学教案《自制泡泡液》视频资源2.png`, "rainbow");
  for (const title of ["神奇的毛细现象", "神奇泡泡实验", "水油分离实验"]) {
    await writeFixtureFile(
      sourceRoot,
      `科学实验图片/水与液体/中班/中班科学实验《${title}》图片/中三班科学实验《${title}》二维码.jpg`,
      title,
    );
  }
  await writeFixtureFile(
    videoIndexRoot,
    "小班上册/视频资源/README.md",
    [
      "# 视频索引",
      "",
      "- [自制泡泡液 - 视频链接](https://example.test/bubble) `EXP-01-VIDEO`",
      "- [会爬升的彩虹 - 视频链接](https://example.test/rainbow) `EXP-02-VIDEO`",
      "",
    ].join("\n"),
  );

  await fs.writeFile(
    catalogPath,
    `${JSON.stringify(
      [
        experiment("自制泡泡液", { topic: "水与液体", ageLabel: "小班", baseId: "01" }),
        experiment("会爬升的彩虹", { topic: "水与液体", ageLabel: "小班", baseId: "02" }),
        experiment("神奇的毛细现象", { baseId: "03" }),
        experiment("神奇泡泡实验", { baseId: "04" }),
        experiment("水油分离实验", { baseId: "05" }),
      ],
      null,
      2,
    )}\n`,
    "utf8",
  );

  const environment = {
    SCIENCE_SOURCE_DIR: sourceRoot,
    SCIENCE_KNOWLEDGE_DIR: videoIndexRoot,
    SCIENCE_CATALOG_PATH: catalogPath,
    SCIENCE_QR_ASSET_DIR: qrAssetRoot,
  };
  const firstRun = runAttachment(environment);
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);

  const firstCatalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const byTitle = new Map(firstCatalog.map((item) => [item.title, item]));
  assert.equal(byTitle.get("自制泡泡液").videoUrl, "https://example.test/bubble");
  assert.equal(byTitle.get("会爬升的彩虹").videoUrl, "https://example.test/rainbow");
  assert.equal(
    byTitle.get("会爬升的彩虹").resources.find((resource) => resource.type === "视频资源").filePath,
    "科学实验图片/水与液体/小班/小班科学教案《自制泡泡液》图片/小班科学教案《自制泡泡液》视频资源2.png",
  );

  for (const title of ["神奇的毛细现象", "神奇泡泡实验", "水油分离实验"]) {
    const item = byTitle.get(title);
    const resource = item.resources.find((candidate) => candidate.type === "视频资源");
    assert.equal(item.videoUrl, "");
    assert.equal(resource.externalUrl, "");
    assert.match(resource.filePath, new RegExp(`《${title}》二维码\\.jpg$`));
    assert.match(resource.publicPath, /^\/science-assets\/video-qr\/[a-f0-9]{16}\.jpg$/);
    assert.equal(await fs.readFile(path.join(qrAssetRoot, path.basename(resource.publicPath)), "utf8"), title);
  }

  const firstResult = await fs.readFile(catalogPath, "utf8");
  const secondRun = runAttachment(environment);
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.equal(await fs.readFile(catalogPath, "utf8"), firstResult);
});
