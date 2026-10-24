import OSS from "ali-oss";

export function isStudentWorkObjectKey(key: string) {
  return key.split("/").includes("student-works");
}

export function mediaObjectKey(segments: string[]): string | null {
  if (!segments.length || !["migrated", "uploads"].includes(segments[0])) return null;
  if (segments.some((part) => !part || part === "." || part === ".." || /[\\/%\u0000-\u001f:]/u.test(part))) return null;
  return segments.join("/");
}

export function mediaRouteUrl(key: string) {
  const valid = mediaObjectKey(key.split("/"));
  if (!valid) throw new Error("Invalid media object key");
  return `/api/media/${valid.split("/").map(encodeURIComponent).join("/")}`;
}

export function getOssConfig(): OSS.Options {
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
  if (!accessKeyId || !accessKeySecret) throw new Error("OSS credentials are not configured");
  return {
    accessKeyId, accessKeySecret,
    bucket: process.env.OSS_BUCKET?.trim() || "guokemeitiku",
    region: process.env.OSS_REGION?.trim() || "oss-cn-hangzhou",
    secure: true,
    timeout: 60_000,
    ...(process.env.ALIBABA_CLOUD_SECURITY_TOKEN?.trim()
      ? { stsToken: process.env.ALIBABA_CLOUD_SECURITY_TOKEN.trim() } : {}),
  };
}

export function createOssClient() { return new OSS(getOssConfig()); }
