import manifestData from "@/data/oss-media-manifest.json";

type Entry = { sourceUrl?: string; sourcePath?: string; key: string };
const entries = manifestData as Entry[];
const mediaRoutes = new Map(entries.map(({ key }) => [key, `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`]));
const references = new Map(entries.flatMap(({ sourceUrl, sourcePath, key }) => {
  const route = mediaRoutes.get(key)!;
  return [sourceUrl, sourcePath].filter((source): source is string => Boolean(source)).map((source) => [source, route] as const);
}));

export function resolveMediaUrl(value: string): string {
  const exact = references.get(value);
  if (exact) return exact;
  try {
    const pathRoute = references.get(new URL(value).pathname);
    return pathRoute ?? value;
  } catch {
    return value;
  }
}

export function resolveMediaReferences<T>(value: T): T {
  if (typeof value === "string") return resolveMediaUrl(value) as T;
  if (Array.isArray(value)) return value.map(resolveMediaReferences) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMediaReferences(item)])) as T;
  }
  return value;
}
