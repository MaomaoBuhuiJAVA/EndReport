/** Shared browser/server URL check; contains no storage credentials or manifest. */
export function isPlayableMediaUrl(value: string) {
  try {
    if (value.startsWith("//")) return false;
    const url = value.startsWith("/api/media/") ? new URL(value, "https://local.invalid") : new URL(value);
    return ["http:", "https:"].includes(url.protocol) && /\.(?:mp4|webm|mov|m4v)$/iu.test(url.pathname);
  } catch { return false; }
}
