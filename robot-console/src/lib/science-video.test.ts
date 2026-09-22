import { describe, expect, it } from "vitest";
import {
  isPackagedStoryVideoFilename,
  scienceVideoPlaybackUrl,
} from "./science-video";

describe("science video playback URL", () => {
  it("routes packaged GitHub Release videos through the same-origin player endpoint", () => {
    expect(
      scienceVideoPlaybackUrl(
        "https://github.com/MaomaoBuhuiJAVA/EndReport/releases/download/science-media-v1/STORY-936a1210e0ce.mp4",
      ),
    ).toBe("/api/science-video/STORY-936a1210e0ce.mp4");
  });

  it("leaves unrelated and user-provided videos unchanged", () => {
    expect(scienceVideoPlaybackUrl("https://example.com/story.mp4")).toBe(
      "https://example.com/story.mp4",
    );
    expect(
      scienceVideoPlaybackUrl(
        "https://github.com/another/repository/releases/download/science-media-v1/STORY-936a1210e0ce.mp4",
      ),
    ).toBe(
      "https://github.com/another/repository/releases/download/science-media-v1/STORY-936a1210e0ce.mp4",
    );
  });

  it("accepts only the packaged story filename format", () => {
    expect(isPackagedStoryVideoFilename("STORY-936a1210e0ce.mp4")).toBe(true);
    expect(isPackagedStoryVideoFilename("../STORY-936a1210e0ce.mp4")).toBe(false);
    expect(isPackagedStoryVideoFilename("STORY-not-a-digest.mp4")).toBe(false);
  });
});
