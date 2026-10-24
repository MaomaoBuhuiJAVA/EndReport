import { createHash } from "node:crypto";

function safePath(value) {
  const pathname = decodeURIComponent(value).replace(/^\//u, "");
  if (!pathname || pathname.includes("\\") || /[\u0000-\u001f]/u.test(pathname) ||
      pathname.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Unsafe media object path");
  }
  return pathname;
}

function sourceEntry(sourceUrl, includeGithub) {
  let url;
  try { url = new URL(sourceUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const release = url.pathname.match(/^\/MaomaoBuhuiJAVA\/EndReport\/releases\/download\/(science-media-v1)\/(.+)$/u);
  if (includeGithub && url.hostname === "github.com" && release) {
    const pathname = safePath(release[2]);
    return { sourceUrl: url.href, key: `migrated/github/${release[1]}/${pathname}`, pathname, source: "github" };
  }
  return null;
}

function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function buildMediaPlan({ blobs, catalog, databaseReferences = [], includeGithub = false }) {
  const entries = new Map();
  function add(url, metadata = {}) {
    const entry = sourceEntry(url, includeGithub);
    if (!entry) return;
    const previous = entries.get(entry.sourceUrl);
    entries.set(entry.sourceUrl, { ...entry, ...previous, ...metadata, publicCatalog: Boolean(previous?.publicCatalog || metadata.publicCatalog) });
  }
  blobs.forEach((blob) => add(blob.url, { expectedBytes: blob.size }));
  strings(catalog).forEach((url) => add(url, { publicCatalog: true }));
  strings(databaseReferences).forEach((url) => add(url));
  return [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function replaceMediaReferences(value, replacements) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceMediaReferences(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceMediaReferences(item, replacements)]));
  }
  return value;
}

export async function copyAndVerifyMedia(entry, transport) {
  const { bytes, contentType, fallbackUsed = false } = await transport.readSource(entry);
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error("Empty media source");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await transport.readTarget(entry);
  if (existing && !bytes.equals(existing)) throw new Error("Destination conflict: existing object preserved");
  if (!existing) await transport.writeTarget(entry, bytes, contentType);
  const readback = existing ?? await transport.readTarget(entry);
  if (!readback || !bytes.equals(readback)) throw new Error("Media verification failed");
  return { bytes: bytes.length, contentType, sha256, verified: true, reused: Boolean(existing), fallbackUsed };
}
