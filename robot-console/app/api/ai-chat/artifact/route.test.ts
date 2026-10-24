import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeTeachingArtifact } from "@/lib/native-workflow/artifacts";
import { GET } from "./route";
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "artifact-route-")); vi.stubEnv("AI_ARTIFACT_DIR", directory); vi.stubEnv("AI_ARTIFACT_SECRET", ""); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
it("downloads persistent bytes with UTF-8 filename, private cache and MIME headers", async () => {
  const file = await storeTeachingArtifact({ bytes: new Uint8Array([1, 2, 3]), name: "通知.pdf", mimeType: "application/pdf" });
  const response = await GET(new Request(new URL(file.url, "http://localhost")));
  expect(response.status).toBe(200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(response.headers.get("content-disposition")).toContain("%E9%80%9A%E7%9F%A5.pdf");
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
it("returns a generic missing response for invalid tokens without private paths", async () => {
  const response = await GET(new Request("http://localhost/api/ai-chat/artifact?token=../../.signing-secret"));
  expect(response.status).toBe(404);
  expect(await response.text()).not.toContain(directory);
});
it("honors request cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  const response = await GET(new Request("http://localhost/api/ai-chat/artifact?token=invalid", {signal: controller.signal}));
  expect(response.status).toBe(499);
});
