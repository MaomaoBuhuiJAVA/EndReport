import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const repository = process.env.GITHUB_REPOSITORY || "MaomaoBuhuiJAVA/EndReport";
const releaseTag = process.env.SCIENCE_MEDIA_RELEASE_TAG || "science-media-v1";
const catalogPath = path.join(repoRoot, "src", "data", "science-knowledge.json");
const sourceRoot = path.resolve(
  process.env.SCIENCE_SOURCE_DIR || path.join(repoRoot, "..", "..", "科学诗、科学故事、科学教案、科学实验"),
);
const storyRoot = path.join(sourceRoot, "科学故事");
const dryRun = process.argv.includes("--dry-run");

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u3000]/gu, "")
    .replaceAll("《", "")
    .replaceAll("》", "")
    .trim();
}

function titleFromFile(filePath) {
  return path.basename(filePath).match(/《([^》]+)》/u)?.[1]?.trim() || "";
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  }));
  return nested.flat();
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (capture) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || allowFailure) resolve({ code, stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function videoMetadata(filePath) {
  const result = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,pix_fmt,width,height",
    "-of", "json",
    filePath,
  ], { capture: true });
  return JSON.parse(result.stdout).streams?.[0] ?? {};
}

function needsTranscode(metadata) {
  return metadata.codec_name !== "h264"
    || metadata.pix_fmt !== "yuv420p"
    || Number(metadata.width) > 1280
    || Number(metadata.height) > 1280;
}

async function ensureRelease() {
  const existing = await run("gh", ["release", "view", releaseTag, "--repo", repository], { allowFailure: true });
  if (existing.code === 0) return;
  await run("gh", [
    "release", "create", releaseTag,
    "--repo", repository,
    "--title", "科小贝科学故事视频",
    "--notes", "网页播放用的 H.264 科学故事视频。原片由项目维护者离线保留。",
  ]);
}

const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const stories = catalog.filter((item) => item.category === "科学故事");
const sourceFiles = (await walk(storyRoot)).filter((filePath) => /\.mp4$/iu.test(filePath));
const filesByTitle = new Map(sourceFiles.map((filePath) => [normalizeTitle(titleFromFile(filePath)), filePath]));
const missing = stories.filter((story) => !filesByTitle.has(normalizeTitle(story.title))).map((story) => story.title);
if (missing.length) throw new Error(`Missing story videos: ${missing.join(", ")}`);

console.log(JSON.stringify({ dryRun, repository, releaseTag, stories: stories.length }));
if (!dryRun) await ensureRelease();

const temporaryDirectory = dryRun ? "" : await fs.mkdtemp(path.join(os.tmpdir(), "kexiaobei-release-"));
try {
  for (const [index, story] of stories.entries()) {
    const sourcePath = filesByTitle.get(normalizeTitle(story.title));
    const metadata = await videoMetadata(sourcePath);
    const transcode = needsTranscode(metadata);
    const assetName = `${story.id}.mp4`;
    const outputPath = dryRun ? sourcePath : path.join(temporaryDirectory, assetName);
    console.log(`[${index + 1}/${stories.length}] ${transcode ? "Transcoding" : "Using compatible source"} ${story.title}`);

    if (!dryRun && transcode) {
      await run("ffmpeg", [
        "-y",
        "-i", sourcePath,
        "-map", "0:v:0",
        "-map", "0:a?",
        "-vf", "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "27",
        "-maxrate", "1400k",
        "-bufsize", "2800k",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
        outputPath,
      ]);
    } else if (!dryRun) {
      await fs.copyFile(sourcePath, outputPath);
    }

    if (!dryRun) {
      await run("gh", [
        "release", "upload", releaseTag,
        outputPath,
        "--repo", repository,
        "--clobber",
      ]);
    }

    const videoUrl = `https://github.com/${repository}/releases/download/${releaseTag}/${assetName}`;
    story.videoUrl = videoUrl;
    for (const resource of story.resources) {
      if (resource.type === "视频资源") resource.externalUrl = videoUrl;
      if (resource.type === "图片资源" && /(?:封面|cover)/iu.test(resource.title)) {
        resource.publicPath = `/science-story-covers/${story.id}.webp`;
        resource.externalUrl = "";
      }
    }
    if (!dryRun) await fs.rm(outputPath, { force: true });
  }

  if (!dryRun) await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
} finally {
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

console.log(JSON.stringify({ completed: !dryRun, stories: stories.length, releaseTag }));
