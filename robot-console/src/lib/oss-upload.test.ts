import { afterEach, beforeEach, expect, it, vi } from "vitest";
const driver = vi.hoisted(() => ({put: vi.fn()}));
vi.mock("ali-oss", () => ({default: class {put = driver.put;}}));
import { persistOssUpload, readUploadForm } from "./oss-upload";

beforeEach(() => {
  vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "oss-id");
  vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "oss-secret");
  driver.put.mockReset(); driver.put.mockResolvedValue({url: "https://private-bucket.example/signed-url"});
});
afterEach(() => vi.unstubAllEnvs());

it("uploads bytes privately and returns a stable website URL without cloud credentials", async () => {
  const file = new File(["material"], "风的旅行.txt", {type: "text/plain"});
  const result = await persistOssUpload(file, {folder: "science-resources/poems", maxBytes: 100});
  expect(result.key).toMatch(/^uploads\/science-resources\/poems\/[a-f0-9-]+-风的旅行.txt$/u);
  expect(result.url).toBe(`/api/media/${result.key.split("/").map(encodeURIComponent).join("/")}`);
  expect(JSON.stringify(result)).not.toMatch(/signed-url|oss-secret/u);
  expect(driver.put).toHaveBeenCalledWith(result.key, Buffer.from("material"), {headers: {"Content-Type": "text/plain", "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true"}});
});

it("preserves an approved media MIME type when the browser has no filename extension", async () => {
  await persistOssUpload(new File(["media"], "录音", {type: "audio/webm"}), {folder: "student-works/verified-parent", maxBytes: 100});
  expect(driver.put.mock.calls[0][2].headers["Content-Type"]).toBe("audio/webm");
});

it.each([
  ["activity.m4v", "video/x-m4v", "video/mp4"],
  ["activity.avi", "video/avi", "video/x-msvideo"],
  ["activity.avi", "video/msvideo", "video/x-msvideo"],
])("accepts a browser video MIME alias for %s", async (name, type, canonical) => {
  const result = await persistOssUpload(new File(["video"], name, {type}), {folder: "science-resources/stories", maxBytes: 100});
  expect(result.url).toMatch(/^\/api\/media\/uploads\/science-resources\/stories\//u);
  expect(driver.put.mock.calls[0][2].headers["Content-Type"]).toBe(canonical);
});

it.each([
  [new File([], "empty.txt", {type: "text/plain"}), "science-resources/poems", 100],
  [new File(["too large"], "poem.txt", {type: "text/plain"}), "science-resources/poems", 2],
  [new File(["<script>"], "page.html", {type: "text/html"}), "science-resources/poems", 100],
  [new File(["media"], "image.png", {type: "audio/mpeg"}), "science-resources/covers", 100],
  [new File(["media"], "image.png", {type: "image/png"}), "../backups", 100],
  [new File(["media"], "image.png", {type: "image/png"}), "student-works/../private", 100],
])("rejects invalid uploads before storing any bytes", async (file, folder, maxBytes) => {
  await expect(persistOssUpload(file, {folder, maxBytes})).rejects.toThrow();
  expect(driver.put).not.toHaveBeenCalled();
});

it("propagates a storage failure without inventing a usable URL", async () => {
  driver.put.mockRejectedValue(new Error("storage unavailable"));
  await expect(persistOssUpload(new File(["poem"], "poem.txt", {type: "text/plain"}), {folder: "science-resources/poems", maxBytes: 100})).rejects.toThrow();
});
it("bounds a chunked request even when Content-Length is omitted", async () => {
  const request = new Request("http://localhost/upload", {method: "POST", body: "more than three bytes", headers: {"Content-Type": "multipart/form-data; boundary=example"}});
  await expect(readUploadForm(request, 3)).rejects.toMatchObject({status: 413});
  expect(driver.put).not.toHaveBeenCalled();
});
