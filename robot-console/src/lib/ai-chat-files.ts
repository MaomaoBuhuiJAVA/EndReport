export type AiChatOutputFileType = "image" | "document";

export type AiChatOutputFile = {
  type: AiChatOutputFileType;
  name: string;
  mimeType?: string;
  url: string;
};

export type NormalizeDifyOutputFilesOptions = {
  sameOrigin?: string;
  difyApiUrl?: string;
};

type OutputFileFormat = {
  kind: AiChatOutputFileType;
  mimeTypes: readonly string[];
  extensions: readonly string[];
};

const MAX_OUTPUT_FILES = 4;
const OUTPUT_FILE_FORMATS: readonly OutputFileFormat[] = [
  { kind: "image", mimeTypes: ["image/avif"], extensions: [".avif"] },
  { kind: "image", mimeTypes: ["image/bmp"], extensions: [".bmp"] },
  { kind: "image", mimeTypes: ["image/gif"], extensions: [".gif"] },
  { kind: "image", mimeTypes: ["image/heic"], extensions: [".heic"] },
  { kind: "image", mimeTypes: ["image/heif"], extensions: [".heif"] },
  { kind: "image", mimeTypes: ["image/jpeg"], extensions: [".jpeg", ".jpg"] },
  { kind: "image", mimeTypes: ["image/png"], extensions: [".png"] },
  { kind: "image", mimeTypes: ["image/webp"], extensions: [".webp"] },
  { kind: "document", mimeTypes: ["application/pdf"], extensions: [".pdf"] },
  {
    kind: "document",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    extensions: [".pptx"],
  },
  {
    kind: "document",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    extensions: [".xlsx"],
  },
  {
    kind: "document",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: [".docx"],
  },
];
const FILE_URL_KEYS = ["remote_url", "remoteUrl", "url", "preview_url", "download_url", "source_url"];
const FILE_NAME_KEYS = ["name", "filename", "file_name"];
const METADATA_FILE_WRAPPER_KEYS = ["data", "metadata", "output", "outputs", "response", "result"];
const MARKDOWN_LINK_PATTERN = /(^|[^!])\[([^\]\r\n]+)\]\(\s*(?:<([^>\s]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/gmu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDifyHost(hostname: string) {
  return hostname === "dify.ai" || hostname.endsWith(".dify.ai") || hostname === "udify.app" || hostname.endsWith(".udify.app");
}

function trustedUrl(value: unknown, { sameOrigin, difyApiUrl }: NormalizeDifyOutputFilesOptions): string | null {
  const raw = stringValue(value);
  if (!raw) return null;

  let sameOriginUrl: URL | null = null;
  if (sameOrigin) {
    try {
      sameOriginUrl = new URL(sameOrigin);
    } catch {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(raw, sameOriginUrl?.origin);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (sameOriginUrl && url.origin === sameOriginUrl.origin) return url.toString();
  if (url.protocol !== "https:") return null;
  if (isDifyHost(url.hostname)) return url.toString();

  if (difyApiUrl) {
    try {
      if (url.origin === new URL(difyApiUrl).origin) return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

function fileCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.files)) return value.files;
  if (Array.isArray(value.data)) return value.data;
  return [value];
}

function candidateString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = stringValue(value[key]);
    if (candidate) return candidate;
  }
  return null;
}

function fileExtension(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.[a-z0-9]+$/u);
    return match?.[0] ?? "";
  } catch {
    return "";
  }
}

function fileNameExtension(name: string | null) {
  const fileName = name?.split(/[?#]/u, 1)[0]?.split(/[\\/]/u).at(-1)?.toLowerCase() ?? "";
  const match = fileName.match(/\.[a-z0-9]+$/u);
  return match?.[0] ?? "";
}

function fileFormatFromMimeType(value: string | null): OutputFileFormat | null {
  const mimeType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!mimeType) return null;
  return OUTPUT_FILE_FORMATS.find((format) => format.mimeTypes.includes(mimeType)) ?? null;
}

function fileFormatFromExtension(extension: string): OutputFileFormat | null {
  return OUTPUT_FILE_FORMATS.find((format) => format.extensions.includes(extension)) ?? null;
}

function declaredTypeMatches(value: string | null, kind: AiChatOutputFileType) {
  if (!value) return true;
  const type = value.toLowerCase();
  if (kind === "image") return type === "image" || type.includes("image");
  return type === "document" || type.includes("document") || type === "file";
}

function candidateFileUrl(value: Record<string, unknown>) {
  return candidateString(value, FILE_URL_KEYS);
}

function candidateFileName(value: Record<string, unknown>) {
  return candidateString(value, FILE_NAME_KEYS);
}

function candidateFileKind(mimeType: string | null, url: string, name: string | null): AiChatOutputFileType | null {
  const urlExtension = fileExtension(url);
  const nameExtension = fileNameExtension(name);
  const normalizedMimeType = mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  // Dify's file proxy can report generated documents as a generic binary
  // stream.  Treat that value as non-decisive only when trusted URL/name
  // extensions independently agree on a supported format.
  const mimeFormat = normalizedMimeType === "application/octet-stream"
    ? null
    : fileFormatFromMimeType(normalizedMimeType);
  const urlFormat = fileFormatFromExtension(urlExtension);
  const nameFormat = fileFormatFromExtension(nameExtension);
  if (
    (normalizedMimeType && !mimeFormat && normalizedMimeType !== "application/octet-stream") ||
    (urlExtension && !urlFormat) ||
    (nameExtension && !nameFormat)
  ) {
    return null;
  }

  const formats = [mimeFormat, urlFormat, nameFormat].filter((format): format is OutputFileFormat => Boolean(format));
  if (!formats.length || formats.some((format) => format !== formats[0])) return null;
  return formats[0].kind;
}

function validCandidateFileType(value: Record<string, unknown>, url: string): AiChatOutputFileType | null {
  const type = candidateFileKind(
    candidateString(value, ["mime_type", "mimeType"]),
    url,
    candidateFileName(value),
  );
  return type && declaredTypeMatches(candidateString(value, ["type"]), type) ? type : null;
}

function safeFileName(value: string | null, url: string, extension: string) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, 160);
  if (normalized) return normalized;

  try {
    const pathName = new URL(url).pathname;
    const lastSegment = pathName.split("/").filter(Boolean).at(-1);
    const decoded = lastSegment ? decodeURIComponent(lastSegment) : "";
    const fromUrl = decoded.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, 160);
    if (fromUrl) return fromUrl;
  } catch {
    // Fall through to a generic display name when the remote name cannot decode.
  }

  return `生成文件${extension || ""}`;
}

function metadataFileSources(metadata: unknown): unknown[] {
  const sources: unknown[] = [];
  const seenRecords = new Set<object>();

  const visit = (value: unknown, depth: number) => {
    if (Array.isArray(value)) {
      for (const nested of value) visit(nested, depth);
      return;
    }
    if (!isRecord(value) || seenRecords.has(value)) return;
    seenRecords.add(value);
    if ("files" in value) sources.push(value.files);
    if (depth === 2) return;

    for (const key of METADATA_FILE_WRAPPER_KEYS) {
      const nested = value[key];
      if (Array.isArray(nested)) {
        sources.push(nested);
        visit(nested, depth + 1);
      } else if (isRecord(nested)) {
        visit(nested, depth + 1);
      }
    }
  };

  visit(metadata, 0);
  return sources;
}

function markdownDocumentFileCandidates(answer: unknown, options: NormalizeDifyOutputFilesOptions): Record<string, unknown>[] {
  if (typeof answer !== "string") return [];

  const candidates: Record<string, unknown>[] = [];
  for (const match of answer.matchAll(MARKDOWN_LINK_PATTERN)) {
    const name = stringValue(match[2]);
    const url = trustedUrl(match[3] ?? match[4], options);
    if (!name || !url || candidateFileKind(null, url, name) !== "document") continue;
    candidates.push({ type: "document", name, url });
  }
  return candidates;
}

export function mergeDifyOutputFileSources(
  {
    answer,
    files,
    metadata,
  }: {
    answer?: unknown;
    files?: unknown;
    metadata?: unknown;
  },
  options: NormalizeDifyOutputFilesOptions = {},
): unknown[] {
  const merged: unknown[] = [];
  const seenTrustedUrls = new Set<string>();

  const append = (source: unknown) => {
    for (const candidate of fileCandidates(source)) {
      if (!isRecord(candidate)) continue;
      const url = trustedUrl(candidateFileUrl(candidate), options);
      // Invalid direct entries must not reserve a URL needed by later metadata.
      if (url && validCandidateFileType(candidate, url)) {
        if (seenTrustedUrls.has(url)) continue;
        seenTrustedUrls.add(url);
      }
      merged.push(candidate);
    }
  };

  append(files);
  for (const source of metadataFileSources(metadata)) append(source);
  append(markdownDocumentFileCandidates(answer, options));
  return merged;
}

/**
 * Converts Dify's loosely-shaped file payload into the small, safe contract
 * shared by the route handler and chat client.
 */
export function normalizeDifyOutputFiles(
  files: unknown,
  options: NormalizeDifyOutputFilesOptions = {},
): AiChatOutputFile[] {
  const normalized: AiChatOutputFile[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of fileCandidates(files)) {
    if (!isRecord(candidate)) continue;
    const url = trustedUrl(
      candidateFileUrl(candidate),
      options,
    );
    if (!url || seenUrls.has(url)) continue;

    const name = candidateFileName(candidate);
    const extension = fileExtension(url);
    const mimeType = candidateString(candidate, ["mime_type", "mimeType"]);
    const type = validCandidateFileType(candidate, url);
    if (!type) continue;

    normalized.push({
      type,
      name: safeFileName(name, url, extension),
      ...(mimeType ? { mimeType } : {}),
      url,
    });
    seenUrls.add(url);
    if (normalized.length === MAX_OUTPUT_FILES) break;
  }

  return normalized;
}

/**
 * Removes upstream targets from Markdown links for files that are already
 * exposed through the signed local download control. Images and unrelated
 * resource links remain unchanged.
 */
export function sanitizeDifyOutputDocumentLinks(
  answer: unknown,
  files: unknown,
  options: NormalizeDifyOutputFilesOptions = {},
) {
  if (typeof answer !== "string" || !answer || !files) return typeof answer === "string" ? answer : "";

  const documentUrls = new Set(
    normalizeDifyOutputFiles(files, options)
      .filter((file) => file.type === "document")
      .map((file) => file.url),
  );
  if (!documentUrls.size) return answer;

  return answer.replace(MARKDOWN_LINK_PATTERN, (full, prefix: string, label: string, angleUrl?: string, plainUrl?: string) => {
    const url = trustedUrl(angleUrl ?? plainUrl, options);
    return url && documentUrls.has(url) ? `${prefix}${label}` : full;
  });
}
