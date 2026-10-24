import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaObjectKey, mediaRouteUrl, getOssConfig } from "./oss-media";

afterEach(() => vi.unstubAllEnvs());

describe("OSS media paths", () => {
  it("round trips a Chinese filename without interpreting a URL as an object key", () => {
    expect(mediaRouteUrl("uploads/science/诗.webp")).toBe("/api/media/uploads/science/%E8%AF%97.webp");
    expect(mediaObjectKey(["uploads", "science", "诗.webp"])).toBe("uploads/science/诗.webp");
    expect(mediaObjectKey(["https:", "example.com", "photo.png"])).toBeNull();
  });

  it("rejects traversal, encoded separators, backslashes and unapproved prefixes", () => {
    for (const segments of [["uploads", "..", "secret"], ["uploads", "a/b"], ["uploads", "a\\b"], ["uploads", "%2e%2e"], ["backup", "db.sql"]]) {
      expect(mediaObjectKey(segments)).toBeNull();
    }
  });

  it("requires explicit OSS credentials and defaults to the user's bucket", () => {
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "");
    expect(() => getOssConfig()).toThrow(/credentials/i);
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "test-id");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "test-secret");
    vi.stubEnv("OSS_BUCKET", "");
    vi.stubEnv("OSS_REGION", "");
    expect(getOssConfig()).toMatchObject({ bucket: "guokemeitiku", region: "oss-cn-hangzhou", secure: true });
  });
});
