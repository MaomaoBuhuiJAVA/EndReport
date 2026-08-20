import type { ScienceLabLink } from "@/lib/science-lab-links";
import { parseAgentResult, type AgentResult } from "@/lib/agent-result";
import { normalizeDifyOutputFiles, type AiChatOutputFile } from "@/lib/ai-chat-files";

export type AiChatPhoto = {
  id: string;
  title: string;
  url: string;
  description?: string | null;
};

export type AiChatAttachmentStatus = {
  name: string;
  status: "uploaded" | "unavailable";
  message?: string;
};

/** A durable science-poem cover update completed by the chat server. */
export type AiChatCoverSync = {
  itemId: string;
  title: string;
  coverUrl: string;
};

const RESPONSE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isResponseId(value: unknown): value is string {
  return typeof value === "string" && RESPONSE_ID_PATTERN.test(value);
}

function isAttachmentStatus(value: unknown): value is AiChatAttachmentStatus {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { name?: unknown; status?: unknown; message?: unknown };
  return (
    typeof candidate.name === "string" &&
    (candidate.status === "uploaded" || candidate.status === "unavailable") &&
    (candidate.message === undefined || typeof candidate.message === "string")
  );
}

function isCoverSync(value: unknown): value is AiChatCoverSync {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AiChatCoverSync>;
  return typeof candidate.itemId === "string" && candidate.itemId.length > 0 && candidate.itemId.length <= 160 &&
    typeof candidate.title === "string" && candidate.title.length > 0 && candidate.title.length <= 120 &&
    typeof candidate.coverUrl === "string" && candidate.coverUrl.length > 0 && candidate.coverUrl.length <= 2048;
}

export type AiChatStreamEvent =
  | {
      type: "meta";
      photos?: AiChatPhoto[];
      sources?: string[];
      labLinks?: ScienceLabLink[];
      attachment?: AiChatAttachmentStatus;
      agentResult?: AgentResult;
      coverSync?: AiChatCoverSync;
      files?: AiChatOutputFile[];
    }
  | { type: "delta"; delta: string }
  | { type: "status"; message: string }
  | {
      type: "done";
      provider: "dify" | "fallback";
      reply: string;
      responseId?: string;
      conversationId?: string;
      photos?: AiChatPhoto[];
      sources?: string[];
      labLinks?: ScienceLabLink[];
      attachment?: AiChatAttachmentStatus;
      agentResult?: AgentResult;
      coverSync?: AiChatCoverSync;
      files?: AiChatOutputFile[];
    }
  | { type: "error"; message?: string };

export type AiChatResponse = {
  reply: string;
  provider?: "dify" | "fallback";
  responseId?: string;
  conversationId?: string;
  photos?: AiChatPhoto[];
  sources?: string[];
  labLinks?: ScienceLabLink[];
  attachment?: AiChatAttachmentStatus;
  agentResult?: AgentResult;
  coverSync?: AiChatCoverSync;
  files?: AiChatOutputFile[];
};

function currentSameOrigin() {
  const origin = globalThis.location?.origin;
  return typeof origin === "string" && origin !== "null" ? origin : undefined;
}

function parsedAgentResult(reply: unknown, rawAgentResult?: unknown): AgentResult | null {
  const sameOrigin = currentSameOrigin();
  if (rawAgentResult !== undefined) {
    return parseAgentResult({ metadata: { agent_result: rawAgentResult }, sameOrigin });
  }
  return parseAgentResult({ text: reply, sameOrigin });
}

function parseFrame(frame: string): AiChatStreamEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;

  try {
    const value = JSON.parse(data) as unknown;
    if (!value || typeof value !== "object" || !("type" in value)) return null;
    const type = (value as { type?: unknown }).type;
    if (type === "meta") {
      const payload = value as Record<string, unknown>;
      const { attachment, agentResult, coverSync, files, ...rest } = payload;
      const result = parsedAgentResult(undefined, agentResult);
      const outputFiles = normalizeDifyOutputFiles(files, { sameOrigin: currentSameOrigin() });
      return {
        ...rest,
        type: "meta",
        ...(isAttachmentStatus(attachment) ? { attachment } : {}),
        ...(result ? { agentResult: result } : {}),
        ...(isCoverSync(coverSync) ? { coverSync } : {}),
        ...(outputFiles.length ? { files: outputFiles } : {}),
      } as AiChatStreamEvent;
    }
    if (type === "delta" && typeof (value as { delta?: unknown }).delta === "string") {
      return value as AiChatStreamEvent;
    }
    if (type === "status" && typeof (value as { message?: unknown }).message === "string") {
      return value as AiChatStreamEvent;
    }
    if (type === "done" && typeof (value as { reply?: unknown }).reply === "string") {
      const payload = value as Record<string, unknown>;
      const { attachment, agentResult, responseId, coverSync, files, ...rest } = payload;
      const result = parsedAgentResult(payload.reply, agentResult);
      const outputFiles = normalizeDifyOutputFiles(files, { sameOrigin: currentSameOrigin() });
      return {
        ...rest,
        type: "done",
        ...(isResponseId(responseId) ? { responseId } : {}),
        ...(isAttachmentStatus(attachment) ? { attachment } : {}),
        ...(result ? { agentResult: result } : {}),
        ...(isCoverSync(coverSync) ? { coverSync } : {}),
        ...(outputFiles.length ? { files: outputFiles } : {}),
      } as AiChatStreamEvent;
    }
    if (type === "error") return value as AiChatStreamEvent;
    return null;
  } catch {
    return null;
  }
}

export async function* parseAiChatStream(
  response: Response,
): AsyncGenerator<AiChatStreamEvent> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n?/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseFrame(frame);
      if (event) yield event;
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      const event = parseFrame(buffer.trim());
      if (event) yield event;
      return;
    }
  }
}

export async function readAiChatResponse(
  response: Response,
  onEvent?: (event: AiChatStreamEvent) => void,
): Promise<AiChatResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as {
      reply?: unknown;
      provider?: unknown;
      conversationId?: unknown;
      responseId?: unknown;
      photos?: unknown;
      sources?: unknown;
      labLinks?: unknown;
      attachment?: unknown;
      agentResult?: unknown;
      coverSync?: unknown;
      files?: unknown;
    };
    const agentResult = parsedAgentResult(payload.reply, payload.agentResult);
    const outputFiles = normalizeDifyOutputFiles(payload.files, { sameOrigin: currentSameOrigin() });
    return {
      reply: typeof payload.reply === "string" ? payload.reply : "",
      ...(payload.provider === "dify" || payload.provider === "fallback" ? { provider: payload.provider } : {}),
      ...(isResponseId(payload.responseId) ? { responseId: payload.responseId } : {}),
      ...(typeof payload.conversationId === "string" && payload.conversationId ? { conversationId: payload.conversationId } : {}),
      ...(Array.isArray(payload.photos) ? { photos: payload.photos as AiChatPhoto[] } : {}),
      ...(Array.isArray(payload.sources) ? { sources: payload.sources.filter((source): source is string => typeof source === "string") } : {}),
      ...(Array.isArray(payload.labLinks) ? { labLinks: payload.labLinks as ScienceLabLink[] } : {}),
      ...(isAttachmentStatus(payload.attachment) ? { attachment: payload.attachment } : {}),
      ...(agentResult ? { agentResult } : {}),
      ...(isCoverSync(payload.coverSync) ? { coverSync: payload.coverSync } : {}),
      ...(outputFiles.length ? { files: outputFiles } : {}),
    };
  }

  let result: AiChatResponse = { reply: "" };
  for await (const event of parseAiChatStream(response)) {
    onEvent?.(event);
    if (event.type === "meta") {
      result = {
        ...result,
        ...(event.photos ? { photos: event.photos } : {}),
        ...(event.sources ? { sources: event.sources } : {}),
        ...(event.labLinks ? { labLinks: event.labLinks } : {}),
        ...(event.attachment ? { attachment: event.attachment } : {}),
        ...(event.agentResult ? { agentResult: event.agentResult } : {}),
        ...(event.coverSync ? { coverSync: event.coverSync } : {}),
        ...(event.files ? { files: event.files } : {}),
      };
    } else if (event.type === "delta") {
      result = { ...result, reply: `${result.reply}${event.delta}` };
    } else if (event.type === "done") {
      result = {
        ...result,
        reply: event.reply,
        provider: event.provider,
        ...(event.responseId ? { responseId: event.responseId } : {}),
        ...(event.conversationId ? { conversationId: event.conversationId } : {}),
        ...(event.photos ? { photos: event.photos } : {}),
        ...(event.sources ? { sources: event.sources } : {}),
        ...(event.labLinks ? { labLinks: event.labLinks } : {}),
        ...(event.attachment ? { attachment: event.attachment } : {}),
        ...(event.agentResult ? { agentResult: event.agentResult } : {}),
        ...(event.coverSync ? { coverSync: event.coverSync } : {}),
        ...(event.files ? { files: event.files } : {}),
      };
    }
  }

  return result;
}
