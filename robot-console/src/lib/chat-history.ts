import type { AgentResult } from "./agent-result";
import type { AiChatOutputFile } from "./ai-chat-files";
import type { ScienceLabLink } from "./science-lab-links";

export const CHAT_HISTORY_STORAGE_KEY = "kexiaobei-chat-history-v1";

export type StoredChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  responseId?: string;
  photos?: Array<{id: string; title: string; url: string; description?: string | null}>;
  labLinks?: ScienceLabLink[];
  userAttachment?: {name: string; kind: "image" | "file"};
  agentResult?: AgentResult;
  files?: AiChatOutputFile[];
  pending?: boolean;
  statusText?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeMessage(value: unknown): StoredChatMessage | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "number" && Number.isFinite(value.id) ? value.id : null;
  const role = value.role === "user" || value.role === "assistant" ? value.role : null;
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (id === null || !role || !text || value.pending === true) return null;

  const message: StoredChatMessage = {id, role, text};
  if (typeof value.responseId === "string" && value.responseId) message.responseId = value.responseId;

  if (Array.isArray(value.photos)) {
    const photos = value.photos.filter((photo): photo is {id: string; title: string; url: string; description?: string | null} => (
      isRecord(photo) && typeof photo.id === "string" && typeof photo.title === "string" && typeof photo.url === "string"
    )).map(photo => ({id: photo.id, title: photo.title, url: photo.url, ...(typeof photo.description === "string" ? {description: photo.description} : {})}));
    if (photos.length) message.photos = photos;
  }

  if (Array.isArray(value.labLinks)) {
    const labLinks = value.labLinks.filter((link): link is ScienceLabLink => (
      isRecord(link) && typeof link.id === "string" && typeof link.title === "string" && typeof link.href === "string"
    ));
    if (labLinks.length) message.labLinks = labLinks;
  }

  if (isRecord(value.userAttachment) && typeof value.userAttachment.name === "string" && (value.userAttachment.kind === "image" || value.userAttachment.kind === "file")) {
    message.userAttachment = {name: value.userAttachment.name, kind: value.userAttachment.kind};
  }

  if (value.agentResult !== undefined) message.agentResult = value.agentResult as AgentResult;
  if (Array.isArray(value.files)) message.files = value.files as AiChatOutputFile[];
  return message;
}

export function readChatHistory(key = CHAT_HISTORY_STORAGE_KEY, storage = defaultStorage()): StoredChatMessage[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeMessage).filter((message): message is StoredChatMessage => message !== null);
  } catch {
    return [];
  }
}

export function writeChatHistory(messages: StoredChatMessage[], key = CHAT_HISTORY_STORAGE_KEY, storage = defaultStorage()): void {
  if (!storage) return;
  try {
    const normalized = messages.map(normalizeMessage).filter((message): message is StoredChatMessage => message !== null);
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // Persistence is an enhancement; a blocked or full browser store must not interrupt chat.
  }
}

export function clearChatHistory(key = CHAT_HISTORY_STORAGE_KEY, storage = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore browser storage failures.
  }
}
