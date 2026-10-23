import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpsRequest } from "node:https";
import dotenv from "dotenv";
import OSS from "ali-oss";
import { buildMediaPlan, copyAndVerifyMedia, replaceMediaReferences } from "./lib/oss-media-migration.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const mode = args.has("--copy") ? "copy" : args.has("--backup") ? "backup" : "plan";
const outputRoot = path.resolve(root, "../../tmp/oss-migration-20261009");
const backupRoot = path.join(outputRoot, "source-backup");
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
const originalMediaRoot = path.resolve(root, "../../科学诗、科学故事、科学教案、科学实验");
const bucket = "guokemeitiku";
const region = "oss-cn-hangzhou";

async function loadEnv() {
  const env = { ...process.env };
  // Runtime variables and the dedicated OSS file take priority over old exports.
  for (const file of [".env.oss.local", ".env.local"]) {
    try {
      const parsed = dotenv.parse(await readFile(path.join(root, file)));
      for (const [key, value] of Object.entries(parsed)) if (!env[key] && value) env[key] = value;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return env;
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.writing`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}

function backupPath(entry) { return path.join(backupRoot, ...entry.key.split("/")); }

async function openSource(url, redirects = 0, headers = {}) {
  const response = await new Promise((resolve, reject) => {
    const request = httpsRequest(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "guoke-oss-migration", ...headers } }, resolve);
    request.once("error", reject);
    request.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
    response.resume();
    const next = new URL(response.headers.location, url);
    if (next.protocol !== "https:" || redirects >= 5) throw new Error("Unsafe source redirect");
    return openSource(next.href, redirects + 1, headers);
  }
  return response;
}

async function githubAssets() {
  const response = await openSource("https://api.github.com/repos/MaomaoBuhuiJAVA/EndReport/releases/tags/science-media-v1", 0, {
    "User-Agent": "guoke-oss-migration", Accept: "application/vnd.github+json",
  });
  if (response.statusCode !== 200) { response.resume(); throw new Error("GitHub release metadata is unavailable"); }
  return JSON.parse((await readResponse(response, 5 * 1024 * 1024)).toString("utf8")).assets;
}

async function readResponse(response, maxBytes) {
  const chunks = [];
  let count = 0;
  try {
    for await (const value of response) {
      count += value.length;
      if (count > maxBytes) throw new Error("Media source exceeds copy size limit");
      chunks.push(Buffer.from(value));
    }
  } finally { response.destroy(); }
  return Buffer.concat(chunks);
}

async function readBlobInRanges(entry) {
  const length = entry.expectedBytes;
  if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_SOURCE_BYTES) throw new Error("Invalid inventoried source size");
  const chunkSize = 256 * 1024;
  const concurrency = 12;
  const rangeRoot = path.join(outputRoot, "range-cache", createHash("sha256").update(`${entry.sourceUrl}:${length}:${entry.expectedSha256 || ""}`).digest("hex"));
  await mkdir(rangeRoot, { recursive: true });
  const chunks = [];
  let contentType = "application/octet-stream";
  for (let offset = 0; offset < length; offset += chunkSize * concurrency) {
    const starts = Array.from({ length: concurrency }, (_, n) => offset + n * chunkSize).filter(start => start < length);
    const batch = await Promise.all(starts.map(async start => {
      const end = Math.min(length - 1, start + chunkSize - 1);
      const chunkPath = path.join(rangeRoot, `${start}.bin`);
      try {
        const cached = await readFile(chunkPath);
        if (cached.length === end - start + 1) return { bytes: cached, contentType: /\.(mp4|mov)$/iu.test(entry.pathname) ? (entry.pathname.endsWith(".mov") ? "video/quicktime" : "video/mp4") : entry.pathname.endsWith(".webp") ? "image/webp" : "image/png" };
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const source = new URL(entry.sourceUrl);
          source.searchParams.set("migration_range", String(start));
          const response = await openSource(source.href, 0, { Range: `bytes=${start}-${end}` });
          if (response.statusCode !== 206 || response.headers["content-range"] !== `bytes ${start}-${end}/${length}`) {
            response.destroy();
            throw new Error("Source did not return the requested byte range");
          }
          const bytes = await readResponse(response, end - start + 1);
          if (bytes.length !== end - start + 1) throw new Error("Source returned an incomplete byte range");
          await writeFile(chunkPath, bytes, { mode: 0o600 });
          return { bytes, contentType: response.headers["content-type"]?.split(";", 1)[0] || contentType };
        } catch { if (attempt === 3) throw new Error("Media range download failed; source file preserved"); }
      }
    }));
    batch.forEach(chunk => { chunks.push(chunk.bytes); contentType = chunk.contentType; });
    console.log(JSON.stringify({ downloading: entry.key, receivedBytes: chunks.reduce((sum, chunk) => sum + chunk.length, 0), totalBytes: length }));
  }
  return { bytes: Buffer.concat(chunks), contentType };
}

async function readSource(entry) {
  try {
    const bytes = await readFile(backupPath(entry));
    const metadata = JSON.parse(await readFile(`${backupPath(entry)}.meta.json`, "utf8"));
    if (metadata.sourceUrl !== entry.sourceUrl ||
        createHash("sha256").update(bytes).digest("hex") !== metadata.sha256 ||
        (entry.expectedSha256 && metadata.sha256 !== entry.expectedSha256)) {
      throw new Error("Local backup verification failed");
    }
    return { bytes, contentType: metadata.contentType, fallbackUsed: metadata.fallbackUsed };
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  let originalBytes = null;
  if (entry.source === "github" && entry.localOriginal) {
    const localFile = path.resolve(originalMediaRoot, entry.localOriginal);
    if (!localFile.startsWith(originalMediaRoot + path.sep)) throw new Error("Unsafe original media path");
    try {
      const candidate = await readFile(localFile);
      if (!entry.expectedSha256 || createHash("sha256").update(candidate).digest("hex") === entry.expectedSha256) originalBytes = candidate;
    }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const ranged = !originalBytes && entry.expectedBytes ? await readBlobInRanges(entry) : null;
  let response;
  if (!originalBytes && !ranged) {
    try { response = await openSource(entry.sourceUrl); }
    catch { throw new Error("Media download failed; source file preserved"); }
  }
  let bytes;
  let contentType;
  let fallbackUsed = false;
  if (ranged) {
    bytes = ranged.bytes;
    contentType = ranged.contentType;
  } else if (originalBytes) {
    bytes = originalBytes;
    contentType = "video/mp4";
    fallbackUsed = true;
  } else {
    if (response.statusCode !== 200) { response.resume(); throw new Error(`Media source returned HTTP ${response.statusCode}`); }
    if (Number(response.headers["content-length"]) > MAX_SOURCE_BYTES) { response.destroy(); throw new Error("Media source exceeds copy size limit"); }
    bytes = await readResponse(response, MAX_SOURCE_BYTES);
    contentType = response.headers["content-type"]?.split(";", 1)[0] || "application/octet-stream";
  }
  if (!bytes.length) throw new Error("Media source is empty");
  if (entry.expectedBytes && bytes.length !== entry.expectedBytes) throw new Error("Media source size differs from inventory");
  if (entry.expectedSha256 && createHash("sha256").update(bytes).digest("hex") !== entry.expectedSha256) throw new Error("GitHub release SHA256 verification failed");
  await mkdir(path.dirname(backupPath(entry)), { recursive: true });
  await writeFile(backupPath(entry), bytes, { mode: 0o600 });
  await writeJson(`${backupPath(entry)}.meta.json`, {
    sourceUrl: entry.sourceUrl, bytes: bytes.length, contentType, fallbackUsed,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  return { bytes, contentType, fallbackUsed };
}

async function main() {
  const env = await loadEnv();
  // Historical copies are planned from the saved inventory, never from a live
  // hosted-storage listing or an additional storage token.
  const inventory = JSON.parse(await readFile(path.join(root, "src/data/oss-media-manifest.json"), "utf8"));
  const blobs = inventory.map(entry => ({url: entry.sourceUrl, size: entry.bytes ?? entry.size}));
  const catalog = JSON.parse(await readFile(path.join(root, "src/data/science-knowledge.json"), "utf8"));
  const plan = buildMediaPlan({ blobs, catalog, includeGithub: args.has("--include-github") });
  const releaseAssets = args.has("--include-github") ? await githubAssets() : [];
  for (const entry of plan) {
    if (entry.source === "github") {
      const asset = releaseAssets.find((item) => item.browser_download_url === entry.sourceUrl);
      if (!asset || !/^sha256:[a-f0-9]{64}$/u.test(asset.digest || "")) throw new Error("GitHub asset checksum is unavailable");
      entry.expectedBytes = asset.size;
      entry.expectedSha256 = asset.digest.slice(7);
      // Keep already copied original files intact. Release bytes use a separate key.
      entry.key = entry.key.replace("migrated/github/", "migrated/github-release/");
      const story = catalog.find((item) => item.videoUrl === entry.sourceUrl);
      if (story?.sourceFile) entry.localOriginal = story.sourceFile;
    }
  }
  await writeJson(path.join(outputRoot, "migration-plan.json"), { collectedAt: new Date().toISOString(), bucket, region, entries: plan });
  console.log(JSON.stringify({ mode, bucket, files: plan.length, savedInventory: blobs.length, github: plan.filter(e => e.source === "github").length }));
  if (mode === "plan") return;

  let client;
  if (mode === "copy") {
    if (!env.ALIBABA_CLOUD_ACCESS_KEY_ID || !env.ALIBABA_CLOUD_ACCESS_KEY_SECRET) {
      throw new Error("OSS credentials are missing in .env.oss.local");
    }
    if (env.OSS_BUCKET && env.OSS_BUCKET !== bucket) throw new Error("Unexpected OSS bucket; copy stopped");
    if (env.OSS_REGION && env.OSS_REGION !== region) throw new Error("Unexpected OSS region; copy stopped");
    client = new OSS({ bucket, region, secure: true, timeout: 180_000,
      accessKeyId: env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      accessKeySecret: env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      ...(env.ALIBABA_CLOUD_SECURITY_TOKEN ? { stsToken: env.ALIBABA_CLOUD_SECURITY_TOKEN } : {}),
    });
  }
  const manifest = { createdAt: new Date().toISOString(), bucket, region, databaseChanged: false, catalogChanged: false, entries: [], failures: [] };
  let checkpoint = Promise.resolve();
  async function processEntry(entry) {
    try {
    if (mode === "backup") {
      const source = await readSource(entry);
      manifest.entries.push({ ...entry, bytes: source.bytes.length, contentType: source.contentType,
        fallbackUsed: source.fallbackUsed, sha256: createHash("sha256").update(source.bytes).digest("hex") });
    } else {
      const result = await copyAndVerifyMedia(entry, {
        readSource,
        readTarget: async ({ key }) => {
          try { return (await client.get(key)).content; }
          catch (error) { if (error.code === "NoSuchKey") return null; throw error; }
        },
        writeTarget: async ({ key }, bytes, contentType) => client.put(key, bytes, {
          headers: { "Content-Type": contentType, "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true" },
        }),
      });
      manifest.entries.push({ ...entry, ...result });
    }
    const recorded = manifest.entries.find((item) => item.key === entry.key);
    console.log(JSON.stringify({ completed: manifest.entries.length, total: plan.length, key: entry.key, bytes: recorded.bytes, verified: mode === "copy" }));
    } catch (error) {
      manifest.failures.push({ key: entry.key, code: typeof error.code === "string" ? error.code : error.name });
      console.log(JSON.stringify({ copyFailed: entry.key, code: error.code || error.name }));
    }
    checkpoint = checkpoint.then(() => writeJson(path.join(outputRoot, mode === "copy" ? "verified-migration.json" : "source-backup-manifest.json"), manifest));
    await checkpoint;
  }
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < plan.length) { const entry = plan[next++]; await processEntry(entry); }
  }));
  if (manifest.failures.length) throw new Error(`${manifest.failures.length} media files require a resumable retry`);
  if (mode === "copy") {
    const replacements = new Map(manifest.entries.map(({ sourceUrl, key }) => [sourceUrl, `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`]));
    // Preview only. The current website and production database remain intact.
    await writeJson(path.join(outputRoot, "science-knowledge-oss-preview.json"), replaceMediaReferences(catalog, replacements));
    await writeJson(path.join(outputRoot, "oss-media-manifest-preview.json"), manifest.entries.map(({ key, sourceUrl, publicCatalog }) => ({ key, sourceUrl, publicCatalog })));
  }
  console.log(JSON.stringify({ finished: true, mode, files: manifest.entries.length, bytes: manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0), outputRoot }));
}

main().catch((error) => {
  // SDK errors can contain signed request URLs: print only a safe classification.
  const ownError = error.name === "Error" && !error.res && !error.request;
  console.error(JSON.stringify({ failed: true, errorType: error.name,
    ...(typeof error.code === "string" && /^[a-zA-Z0-9_]+$/u.test(error.code) ? { code: error.code } : {}),
    ...(ownError && !/https?:\/\/|AccessKey|password/iu.test(error.message) ? { reason: error.message } : {}),
  }));
  process.exitCode = 1;
});
