import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { storeTeachingArtifact, readTeachingArtifact } from "./artifacts";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "teaching-artifacts-")); vi.stubEnv("AI_ARTIFACT_DIR", directory); vi.stubEnv("AI_ARTIFACT_SECRET", ""); });
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
describe("persistent teaching artifacts", () => {
  it("stores real bytes privately and survives module reload with a persistent signing secret", async () => {
    const file = await storeTeachingArtifact({ bytes: new Uint8Array([1, 2, 3]), name: "通知.pdf", mimeType: "application/pdf" });
    expect(file.url).toMatch(/^\/api\/ai-chat\/artifact\?token=/);
    expect(file.url).not.toContain(directory);
    vi.resetModules();
    const fresh = await import("./artifacts");
    const retrieved = await fresh.readTeachingArtifact(new URL(file.url, "http://localhost").searchParams.get("token")!);
    expect(retrieved?.name).toBe("通知.pdf");
    expect(retrieved?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(await readdir(directory)).toContain(".signing-secret");
  });
  it("rejects tampered, expired and traversal tokens", async () => {
    const file = await storeTeachingArtifact({ bytes: new Uint8Array([1]), name: "../通知.pdf", mimeType: "application/pdf" });
    const token = new URL(file.url, "http://localhost").searchParams.get("token")!;
    expect(await readTeachingArtifact(token + "x")).toBeNull();
    expect(await readTeachingArtifact("../../secret")).toBeNull();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    expect(await readTeachingArtifact(token)).toBeNull();
  });
  it("rejects empty or oversized generated files and cancels reads", async () => {
    await expect(storeTeachingArtifact({ bytes: new Uint8Array(), name: "空.pdf", mimeType: "application/pdf" })).rejects.toThrow(/空/);
    await expect(storeTeachingArtifact({ bytes: new Uint8Array(20 * 1024 * 1024 + 1), name: "大.pdf", mimeType: "application/pdf" })).rejects.toThrow(/大小|20/);
    const controller = new AbortController(); controller.abort();
    await expect(readTeachingArtifact("invalid", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("verifies the same artifact in a fresh operating-system process", async () => {
    const file = await storeTeachingArtifact({ bytes: new Uint8Array([7, 8]), name: "跨进程.pdf", mimeType: "application/pdf" });
    const token = new URL(file.url, "http://localhost").searchParams.get("token")!;
    const script = `const {readTeachingArtifact} = await import(${JSON.stringify(new URL("./artifacts.ts", import.meta.url).href)}); const result = await readTeachingArtifact(${JSON.stringify(token)}); console.log(JSON.stringify({name:result?.name, bytes:Array.from(result?.bytes ?? [])}));`;
    const result = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], { env: {...process.env}, windowsHide: true });
    expect(JSON.parse(result.stdout)).toEqual({name: "跨进程.pdf", bytes: [7, 8]});
  });
  it("removes expired files when new content is stored", async () => {
    const old = await storeTeachingArtifact({ bytes: new Uint8Array([1]), name: "旧.pdf", mimeType: "application/pdf" });
    const oldId = new URL(old.url, "http://localhost").searchParams.get("token")!.split(".")[0];
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    await storeTeachingArtifact({ bytes: new Uint8Array([2]), name: "新.pdf", mimeType: "application/pdf" });
    expect(await readdir(directory)).not.toContain(`${oldId}.bin`);
    expect(await readdir(directory)).not.toContain(`${oldId}.json`);
  });
  it("keeps at most 128 persisted files and evicts the oldest download at capacity", async () => {
    const old = await storeTeachingArtifact({ bytes: new Uint8Array([1]), name: "最早.pdf", mimeType: "application/pdf" });
    const expires = Date.now() + 24 * 60 * 60 * 1000 + 1000;
    for (let index = 0; index < 127; index++) {
      const id = index.toString(16).padStart(48, "0");
      await writeFile(join(directory, `${id}.bin`), new Uint8Array([1]));
      await writeFile(join(directory, `${id}.json`), JSON.stringify({name: "预存.pdf", mimeType: "application/pdf", expires, size: 1}));
    }
    const current = await storeTeachingArtifact({ bytes: new Uint8Array([2]), name: "最新.pdf", mimeType: "application/pdf" });
    expect((await readdir(directory)).filter((name) => name.endsWith(".bin"))).toHaveLength(128);
    expect(await readTeachingArtifact(new URL(old.url, "http://localhost").searchParams.get("token")!)).toBeNull();
    expect((await readTeachingArtifact(new URL(current.url, "http://localhost").searchParams.get("token")!))?.name).toBe("最新.pdf");
  });
});
