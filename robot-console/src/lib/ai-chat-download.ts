import { normalizeDifyOutputFiles, type AiChatOutputFile } from "./ai-chat-files";

const DOWNLOAD_ROUTE = "/api/ai-chat/download";
export const MAX_AI_CHAT_DOWNLOAD_BYTES = 12 * 1024 * 1024;

const DOCUMENT_CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".pdf", "application/pdf"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
] as const);

const DOCUMENT_EXTENSIONS_BY_CONTENT_TYPE: ReadonlyMap<string, string> = new Map(
  [...DOCUMENT_CONTENT_TYPES.entries()].map(([extension, contentType]) => [contentType, extension]),
);

type DifyDocumentDownloadOptions = {
  difyApiUrl?: string;
};

function outputFileCandidate(file: AiChatOutputFile) {
  return {
    type: file.type,
    name: file.name,
    ...(file.mimeType ? { mime_type: file.mimeType } : {}),
    url: file.url,
  };
}

function documentExtensionFromUrl(url: string) {
  try {
    const match = new URL(url).pathname.toLowerCase().match(/\.[a-z0-9]+$/u);
    const extension = match?.[0];
    return extension && DOCUMENT_CONTENT_TYPES.has(extension) ? extension : null;
  } catch {
    return null;
  }
}

function documentExtensionFromName(name: string) {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/u);
  const extension = match?.[0];
  return extension && DOCUMENT_CONTENT_TYPES.has(extension) ? extension : null;
}

function normalizedMimeType(value: string | undefined) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

/**
 * Revalidates a document before it is rendered as a download or fetched by
 * the server. No same-origin exception is available to this path.
 */
export function normalizeDifyDocumentDownload(
  file: AiChatOutputFile,
  options: DifyDocumentDownloadOptions = {},
) {
  return normalizeDifyOutputFiles([outputFileCandidate(file)], options).find(
    (outputFile) => outputFile.type === "document",
  ) ?? null;
}

export function buildAiChatDocumentDownloadUrl(file: AiChatOutputFile) {
  if (file.type !== "document") return null;

  const currentOrigin = globalThis.location?.origin;
  if (currentOrigin && file.url.startsWith("blob:")) {
    try {
      const blobUrl = new URL(file.url);
      if (blobUrl.protocol === "blob:" && blobUrl.origin === currentOrigin) return file.url;
    } catch {
      return null;
    }
  }
  let parsed: URL;
  try {
    parsed = new URL(file.url, currentOrigin || "https://invalid.local");
  } catch {
    return null;
  }
  if (!currentOrigin && /^[a-z][a-z\d+.-]*:/iu.test(file.url)) return null;
  if (parsed.pathname !== DOWNLOAD_ROUTE) return null;
  if (currentOrigin && parsed.origin !== currentOrigin) return null;

  const token = parsed.searchParams.get("token");
  if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) return null;
  for (const key of parsed.searchParams.keys()) {
    if (key !== "token") return null;
  }
  return `${DOWNLOAD_ROUTE}?token=${encodeURIComponent(token)}`;
}

export function documentDownloadContentType(file: AiChatOutputFile) {
  const mimeType = normalizedMimeType(file.mimeType);
  if (mimeType && DOCUMENT_EXTENSIONS_BY_CONTENT_TYPE.has(mimeType)) return mimeType;

  const extension = documentExtensionFromUrl(file.url) ?? documentExtensionFromName(file.name);
  return extension ? DOCUMENT_CONTENT_TYPES.get(extension) ?? null : null;
}

function preferredDocumentExtension(file: AiChatOutputFile) {
  const fromUrl = documentExtensionFromUrl(file.url);
  if (fromUrl) return fromUrl;

  const fromName = documentExtensionFromName(file.name);
  if (fromName) return fromName;

  const mimeType = normalizedMimeType(file.mimeType);
  return mimeType ? DOCUMENT_EXTENSIONS_BY_CONTENT_TYPE.get(mimeType) ?? null : null;
}

export function safeAiChatDownloadFilename(file: AiChatOutputFile) {
  const extension = preferredDocumentExtension(file);
  const name = file.name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/^[.\s]+|[.\s]+$/gu, "")
    .slice(0, 160);
  const fallback = `generated-document${extension ?? ""}`;
  const candidate = name || fallback;

  if (!extension || candidate.toLowerCase().endsWith(extension)) return candidate;
  return `${candidate}${extension}`;
}

function encodeContentDispositionFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => {
    return `%${character.codePointAt(0)?.toString(16).toUpperCase()}`;
  });
}

export function aiChatDownloadContentDisposition(file: AiChatOutputFile) {
  const filename = safeAiChatDownloadFilename(file);
  const asciiFilename = filename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/["\\]/gu, "_")
    .trim() || "generated-document";

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeContentDispositionFilename(filename)}`;
}
