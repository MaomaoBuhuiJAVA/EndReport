import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import OSS from "ali-oss";
import { qwenApiKey, qwenMultimodalEndpoint } from "../../src/lib/qwen-config-core.mjs";
import { isGeneratedImageUrl } from "../../src/lib/generated-image-url-core.mjs";

export async function loadNativeUploadEnv(root = process.cwd()) {
  for (const name of [".env.oss.local", ".env.production.local", ".env.local"]) {
    try {
      const values = dotenv.parse(await readFile(path.join(root, name)));
      for (const [key, value] of Object.entries(values)) if (!process.env[key] && value) process.env[key] = value;
    } catch (error) {if (error.code !== "ENOENT") throw error;}
  }
}

export function ossUploadClient() {
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim(), accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
  if (!accessKeyId || !accessKeySecret) throw new Error("OSS upload credentials are not configured");
  return new OSS({accessKeyId, accessKeySecret, bucket: process.env.OSS_BUCKET?.trim() || "guokemeitiku", region: process.env.OSS_REGION?.trim() || "oss-cn-hangzhou", secure: true, timeout: 180_000, ...(process.env.ALIBABA_CLOUD_SECURITY_TOKEN?.trim() ? {stsToken: process.env.ALIBABA_CLOUD_SECURITY_TOKEN.trim()} : {})});
}

export async function putPrivateMedia(pathname, source, {contentType, client} = {}) {
  const parts = pathname.split("/");
  if (parts.length < 2 || parts.some(part => !part || part === "." || part === ".." || /[\\%\u0000-\u001f:]/u.test(part))) throw new Error("Invalid media upload path");
  const name = parts.pop();
  const key = `uploads/${parts.join("/")}/${randomUUID()}-${name}`;
  await (client ?? ossUploadClient()).put(key, source, {headers: {"Content-Type": contentType || "application/octet-stream", "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true"}});
  return {key, url: `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`};
}

export async function generateQwenCover(prompt, {fetchImpl = fetch} = {}) {
  const key = qwenApiKey();
  if (!key) throw new Error("Qwen API credentials are not configured");
  const response = await fetchImpl(qwenMultimodalEndpoint(), {method: "POST", redirect: "error", signal: AbortSignal.timeout(110_000), headers: {"Content-Type": "application/json", Authorization: `Bearer ${key}`}, body: JSON.stringify({model: process.env.QWEN_IMAGE_MODEL?.trim() || "qwen-image", input: {messages: [{role: "user", content: [{text: prompt}]}]}, parameters: {size: "1328*1328", n: 1, result_format: "message", prompt_extend: true, watermark: false, negative_prompt: "文字，汉字，字母，数字，水印，商标，真实儿童肖像"}})});
  if (!response.ok) {await response.body?.cancel(); throw new Error(`Qwen image service returned ${response.status}`);}
  const payload = await response.json();
  const result = payload.output?.choices?.[0]?.message?.content?.find(value => typeof value.image === "string")?.image;
  const url = new URL(result);
  if (!isGeneratedImageUrl(url)) throw new Error("Qwen did not return a trusted image");
  return url.toString();
}
