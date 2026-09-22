const SCIENCE_VIDEO_RELEASE_PATH =
  "/MaomaoBuhuiJAVA/EndReport/releases/download/science-media-v1/";

const PACKAGED_STORY_VIDEO_PATTERN = /^STORY-[0-9a-f]{12}\.mp4$/iu;

export function isPackagedStoryVideoFilename(value: string) {
  return PACKAGED_STORY_VIDEO_PATTERN.test(value);
}

export function scienceVideoPlaybackUrl(value: string) {
  if (!value) return value;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "github.com" ||
      !url.pathname.startsWith(SCIENCE_VIDEO_RELEASE_PATH)
    ) {
      return value;
    }

    const filename = decodeURIComponent(url.pathname.slice(SCIENCE_VIDEO_RELEASE_PATH.length));
    if (!isPackagedStoryVideoFilename(filename)) return value;

    return `/api/science-video/${encodeURIComponent(filename)}`;
  } catch {
    return value;
  }
}
