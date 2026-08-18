import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeDifyDocumentDownload } from "./ai-chat-download";
import type { AiChatOutputFile } from "./ai-chat-files";

const DOWNLOAD_ROUTE = "/api/ai-chat/download";
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 10 * 60;
const MAX_TOKEN_LENGTH = 4096;

type SignedDownloadPayload = {
  v: typeof TOKEN_VERSION;
  exp: number;
  file: {
    type: "document";
    name: string;
    mimeType?: string;
    url: string;
  };
};

export type BuildSignedAiChatDocumentDownloadOptions = {
  apiKey?: string;
  difyApiUrl?: string;
  requestUrl: string;
  now?: number;
  ttlSeconds?: number;
};

export type SignAiChatOutputFilesOptions = BuildSignedAiChatDocumentDownloadOptions;

function base64UrlEncode(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return bytes.toString("base64url");
}

function base64UrlDecode(value: string) {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function signingKey(apiKey: string) {
  return createHmac("sha256", "EndReport AI chat download token v1")
    .update(apiKey)
    .digest();
}

function signPayload(encodedPayload: string, apiKey: string) {
  return createHmac("sha256", signingKey(apiKey)).update(encodedPayload).digest();
}

function tokenNow(now?: number) {
  return Math.floor((now ?? Date.now()) / 1000);
}

function safeTtlSeconds(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(value!), 1), MAX_TTL_SECONDS);
}

function encodeToken(payload: SignedDownloadPayload, apiKey: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(signPayload(encodedPayload, apiKey));
  return `${encodedPayload}.${signature}`;
}

function parsePayload(value: unknown): SignedDownloadPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<SignedDownloadPayload>;
  const file = payload.file;
  if (
    payload.v !== TOKEN_VERSION ||
    !Number.isSafeInteger(payload.exp) ||
    !file ||
    typeof file !== "object" ||
    file.type !== "document" ||
    typeof file.name !== "string" ||
    file.name.length === 0 ||
    file.name.length > 200 ||
    typeof file.url !== "string" ||
    file.url.length === 0 ||
    file.url.length > 4096 ||
    (file.mimeType !== undefined && typeof file.mimeType !== "string")
  ) {
    return null;
  }
  return {
    v: TOKEN_VERSION,
    exp: payload.exp as number,
    file: {
      type: "document",
      name: file.name,
      ...(file.mimeType ? { mimeType: file.mimeType } : {}),
      url: file.url,
    },
  };
}

export function buildSignedAiChatDocumentDownloadUrl(
  file: AiChatOutputFile,
  options: BuildSignedAiChatDocumentDownloadOptions,
) {
  const apiKey = options.apiKey?.trim();
  if (!apiKey || file.type !== "document") return null;

  try {
    // Validate the caller URL before issuing a route-relative link. This also
    // prevents malformed internal requests from becoming signed outputs.
    const requestUrl = new URL(options.requestUrl);
    if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") return null;
  } catch {
    return null;
  }

  const document = normalizeDifyDocumentDownload(file, { difyApiUrl: options.difyApiUrl });
  if (!document) return null;

  const payload: SignedDownloadPayload = {
    v: TOKEN_VERSION,
    exp: tokenNow(options.now) + safeTtlSeconds(options.ttlSeconds),
    file: {
      type: "document",
      name: document.name,
      ...(document.mimeType ? { mimeType: document.mimeType } : {}),
      url: document.url,
    },
  };
  return `${DOWNLOAD_ROUTE}?token=${encodeURIComponent(encodeToken(payload, apiKey))}`;
}

export function signAiChatOutputFiles(
  files: AiChatOutputFile[],
  options: SignAiChatOutputFilesOptions,
) {
  return files.flatMap((file) => {
    if (file.type !== "document") return [file];
    const url = buildSignedAiChatDocumentDownloadUrl(file, options);
    return url ? [{ ...file, url }] : [];
  });
}

export function verifyAiChatDownloadToken(token: string, apiKey: string, now?: number): AiChatOutputFile | null {
  const secret = apiKey.trim();
  if (!secret || typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;

  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1 || token.indexOf(".", separator + 1) !== -1) return null;
  const encodedPayload = token.slice(0, separator);
  const encodedSignature = token.slice(separator + 1);
  const expectedSignature = signPayload(encodedPayload, secret);
  const receivedSignature = base64UrlDecode(encodedSignature);
  if (!receivedSignature || receivedSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(receivedSignature, expectedSignature)) return null;

  const payloadBytes = base64UrlDecode(encodedPayload);
  if (!payloadBytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return null;
  }
  const payload = parsePayload(parsed);
  if (!payload || payload.exp <= tokenNow(now)) return null;

  return {
    type: "document",
    name: payload.file.name,
    ...(payload.file.mimeType ? { mimeType: payload.file.mimeType } : {}),
    url: payload.file.url,
  };
}
