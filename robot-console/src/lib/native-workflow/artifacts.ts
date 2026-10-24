import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type TeachingFile = { bytes: Uint8Array; name: string; mimeType: string };
type Metadata = { name: string; mimeType: string; expires: number; size: number };
const TTL = 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_FILES = 128;
function directory() {
  const configured = process.env.AI_ARTIFACT_DIR?.trim();
  return configured ? resolve(/* turbopackIgnore: true */ configured) : join(process.cwd(), ".ai-artifacts");
}
function aborted(signal?: AbortSignal) { signal?.throwIfAborted(); }
async function root() {
  const dir = directory(); await mkdir(/* turbopackIgnore: true */ dir, { recursive: true, mode: 0o700 });
  // These are runtime-generated private files, never build-time application assets.
  if ((await lstat(/* turbopackIgnore: true */ dir)).isSymbolicLink()) throw new Error("文档存储不可用。");
  return dir;
}
async function secret(dir: string) {
  const configured = process.env.AI_ARTIFACT_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) throw new Error("文档签名配置无效。");
    return configured;
  }
  const path = join(/* turbopackIgnore: true */ dir, ".signing-secret");
  try {
    const handle = await open(/* turbopackIgnore: true */ path, "wx", 0o600);
    try { await handle.writeFile(randomBytes(32).toString("hex")); await handle.sync(); } finally { await handle.close(); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  // Another process may still be filling the exclusively created key file.
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await lstat(/* turbopackIgnore: true */ path)).isSymbolicLink()) throw new Error("文档签名配置无效。");
    const value = await readFile(/* turbopackIgnore: true */ path, "utf8");
    if (/^[a-f0-9]{64}$/.test(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("文档签名配置无效。");
}
function sign(payload: string, key: string) { return createHmac("sha256", key).update(payload).digest("base64url"); }
function safeName(name: string) { return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/^\.+|[. ]+$/g, "").slice(0, 150) || "教学文档"; }
async function lock(dir: string) {
  const path = join(/* turbopackIgnore: true */ dir, ".write-lock");
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await mkdir(path, { mode: 0o700 }); return async () => { await rm(path, { recursive: true, force: true }); }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const info = await stat(/* turbopackIgnore: true */ path).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 60_000) await rm(path, { recursive: true, force: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("文档存储繁忙，请稍后重试。");
}
async function prune(dir: string, incoming: number) {
  const names = (await readdir(/* turbopackIgnore: true */ dir)).filter((name) => /^[a-f0-9]{48}\.json$/.test(name));
  const files: {id: string; expires: number; size: number}[] = [];
  for (const name of names) {
    const id = name.slice(0, -5);
    try {
      const metadata = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, name), "utf8")) as Metadata;
      if (metadata.expires > Date.now() && Number.isFinite(metadata.size) && metadata.size <= MAX_FILE_BYTES) { files.push({id, expires: metadata.expires, size: metadata.size}); continue; }
    } catch { /* Discard incomplete or expired private records. */ }
    await Promise.all([rm(join(/* turbopackIgnore: true */ dir, name), { force: true }), rm(join(/* turbopackIgnore: true */ dir, `${id}.bin`), { force: true })]);
  }
  files.sort((a, b) => a.expires - b.expires);
  let bytes = files.reduce((sum, file) => sum + file.size, 0);
  while (files.length >= MAX_FILES || bytes + incoming > MAX_BYTES) {
    const file = files.shift(); if (!file) break;
    await Promise.all([rm(join(/* turbopackIgnore: true */ dir, `${file.id}.json`), { force: true }), rm(join(/* turbopackIgnore: true */ dir, `${file.id}.bin`), { force: true })]); bytes -= file.size;
  }
  // Clean partial writes left by a terminated process while holding the write lock.
  const retained = new Set(files.map((file) => `${file.id}.bin`));
  for (const name of await readdir(/* turbopackIgnore: true */ dir)) if (/^[a-f0-9]{48}\.bin$/.test(name) && !retained.has(name)) await rm(join(/* turbopackIgnore: true */ dir, name), { force: true });
}
export async function storeTeachingArtifact(file: TeachingFile): Promise<{type:"document";name:string;mimeType:string;url:string}> {
  if (!file.bytes.byteLength) throw new Error("生成的文档为空。");
  if (file.bytes.byteLength > MAX_FILE_BYTES) throw new Error("文档大小不能超过 20MB。");
  if (!/^application\/[a-z0-9.+-]+$/i.test(file.mimeType)) throw new Error("文档类型无效。");
  try {
    const dir = await root(); const key = await secret(dir); const unlock = await lock(dir);
    try {
      await prune(dir, file.bytes.byteLength);
      const id = randomBytes(24).toString("hex"); const expires = Date.now() + TTL;
      const metadata: Metadata = { name: safeName(file.name), mimeType: file.mimeType, expires, size: file.bytes.byteLength };
      await writeFile(join(/* turbopackIgnore: true */ dir, `${id}.bin`), file.bytes, { flag: "wx", mode: 0o600 });
      try { await writeFile(join(/* turbopackIgnore: true */ dir, `${id}.json`), JSON.stringify(metadata), { flag: "wx", mode: 0o600 }); }
      catch (error) { await rm(join(/* turbopackIgnore: true */ dir, `${id}.bin`), { force: true }); throw error; }
      const payload = `${id}.${expires}`;
      return { type: "document", name: metadata.name, mimeType: metadata.mimeType, url: `/api/ai-chat/artifact?token=${payload}.${sign(payload, key)}` };
    } finally { await unlock(); }
  } catch (error) {
    if (error instanceof Error && /文档/.test(error.message)) throw error;
    throw new Error("文档保存失败，请稍后重试。");
  }
}
export async function readTeachingArtifact(token: string, signal?: AbortSignal): Promise<TeachingFile | null> {
  aborted(signal);
  if (token.length > 160 || !/^[a-f0-9]{48}\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [id, expiry, signature] = token.split(".");
  const expires = Number(expiry);
  if (expires <= Date.now() || expires > Date.now() + TTL + 60_000) return null;
  try {
    const dir = await root(); const key = await secret(dir); aborted(signal);
    const expected = sign(`${id}.${expiry}`, key);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    for (const extension of ["json", "bin"]) if (!(await lstat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, `${id}.${extension}`))).isFile()) return null;
    const metadata = JSON.parse(await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, `${id}.json`), { encoding: "utf8", signal })) as Metadata;
    if (metadata.expires !== expires || typeof metadata.name !== "string" || safeName(metadata.name) !== metadata.name || !/^application\/[a-z0-9.+-]+$/i.test(metadata.mimeType) || metadata.size < 1 || metadata.size > MAX_FILE_BYTES) return null;
    if ((await stat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, `${id}.bin`))).size !== metadata.size) return null;
    const bytes = await readFile(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, `${id}.bin`), { signal }); aborted(signal);
    return { bytes: new Uint8Array(bytes), name: metadata.name, mimeType: metadata.mimeType };
  } catch { aborted(signal); return null; }
}
