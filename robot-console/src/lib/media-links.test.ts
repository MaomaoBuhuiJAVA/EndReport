import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/data/oss-media-manifest.json", () => ({ default: [
  { key: "migrated/legacy-store/store/cover.png", sourceUrl: "https://legacy-media.example.org/cover.png", publicCatalog: true },
  { key: "migrated/legacy-media/store/covers/fan.png", sourcePath: "/science-resource-covers/fan.png", publicCatalog: true },
] }));
import { resolveMediaUrl, resolveMediaReferences } from "./media-links";
import { isPlayableMediaUrl } from "./media-url";

afterEach(() => vi.unstubAllEnvs());

describe("OSS media references", () => {
  it("maps previously migrated URLs without depending on the old switch", () => {
    vi.stubEnv("OSS_MEDIA_ENABLED", "");
    expect(resolveMediaUrl("https://legacy-media.example.org/cover.png")).toBe("/api/media/migrated/legacy-store/store/cover.png");
  });
  it("maps a migrated media path regardless of its original host", () => {
    expect(resolveMediaUrl("https://media.example.org/science-resource-covers/fan.png?download=1"))
      .toBe("/api/media/migrated/legacy-media/store/covers/fan.png");
  });
  it("maps verified nested references after enabling OSS without changing database records", () => {
    vi.stubEnv("OSS_MEDIA_ENABLED", "1");
    const input = { coverUrl: "https://legacy-media.example.org/cover.png", body: "https://other.example/video.mp4", resources: [{ publicPath: "https://legacy-media.example.org/cover.png" }] };
    expect(resolveMediaReferences(input)).toEqual({ coverUrl: "/api/media/migrated/legacy-store/store/cover.png", body: input.body, resources: [{ publicPath: "/api/media/migrated/legacy-store/store/cover.png" }] });
    expect(input.coverUrl).toBe("https://legacy-media.example.org/cover.png");
  });
  it("recognizes both absolute videos and the website's own media route", () => {
    expect(isPlayableMediaUrl("/api/media/migrated/github-release/story.mp4")).toBe(true);
    expect(isPlayableMediaUrl("https://media.example/story.mp4")).toBe(true);
    expect(isPlayableMediaUrl("javascript:alert(1).mp4")).toBe(false);
    expect(isPlayableMediaUrl("//evil.example/story.mp4")).toBe(false);
    expect(isPlayableMediaUrl("https://p1.qr105.cn/example")).toBe(false);
  });
});
