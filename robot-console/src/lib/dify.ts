export type DifyReply = {
  answer: string;
  conversationId?: string;
  metadata?: unknown;
  files?: unknown;
};

export type DifyStreamEvent = {
  event?: string;
  answer?: string;
  conversationId?: string;
  error?: string;
  metadata?: unknown;
  files?: unknown;
};

export type DifyFileReference = {
  type: "image" | "document" | "audio" | "video";
  transfer_method: "local_file";
  upload_file_id: string;
};

type GenerateDifyReplyArgs = {
  apiKey?: string;
  apiUrl?: string;
  message: string;
  user: string;
  conversationId?: string;
  files?: DifyFileReference[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

type UploadDifyFileArgs = {
  apiKey?: string;
  apiUrl?: string;
  file: Blob;
  fileName?: string;
  user: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

type DifyChatResponse = {
  answer?: string;
  conversation_id?: string;
  metadata?: unknown;
  files?: unknown;
};

const DEFAULT_DIFY_API_URL = "https://api.dify.ai/v1/chat-messages";
const DIFY_REQUEST_TIMEOUT_MS = 60_000;

function difyUploadUrl(apiUrl: string) {
  try {
    const url = new URL(apiUrl);
    url.pathname = url.pathname.replace(/\/chat-messages\/?$/u, "/files/upload");
    return url.toString();
  } catch {
    return apiUrl.replace(/\/chat-messages\/?$/u, "/files/upload");
  }
}

function difyFileType(file: Blob, fileName = ""): DifyFileReference["type"] {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  const extension = fileName.trim().toLowerCase().match(/\.[^.]+$/u)?.[0];
  if (extension && [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"].includes(extension)) {
    return "image";
  }
  return "document";
}

export async function uploadDifyFile({
  apiKey,
  apiUrl = DEFAULT_DIFY_API_URL,
  file,
  fileName,
  user,
  signal,
  fetchImpl = fetch,
}: UploadDifyFileArgs): Promise<DifyFileReference | null> {
  if (!apiKey || !file || file.size <= 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIFY_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const formData = new FormData();
    const name = fileName?.trim() || (
      typeof File !== "undefined" && file instanceof File ? file.name : "attachment"
    );
    formData.append("file", file, name);
    formData.append("user", user);

    const response = await fetchImpl(difyUploadUrl(apiUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { id?: unknown };
    const id = typeof data.id === "string" ? data.id.trim() : "";
    if (!id) return null;
    return {
      type: difyFileType(file, name),
      transfer_method: "local_file",
      upload_file_id: id,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function buildChatPayload({
  message,
  user,
  conversationId,
  responseMode,
  files,
}: Pick<GenerateDifyReplyArgs, "message" | "user" | "conversationId" | "files"> & { responseMode: "blocking" | "streaming" }) {
  return {
    inputs: {},
    query: message,
    response_mode: responseMode,
    user,
    conversation_id: conversationId,
    ...(files?.length ? { files } : {}),
  };
}

export async function generateDifyReply({
  apiKey,
  apiUrl = DEFAULT_DIFY_API_URL,
  message,
  user,
  conversationId,
  files,
  signal,
  fetchImpl = fetch,
}: GenerateDifyReplyArgs): Promise<DifyReply | null> {
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIFY_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatPayload({ message, user, conversationId, responseMode: "blocking", files })),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as DifyChatResponse;
    const answer = typeof data.answer === "string" ? data.answer.trim() : "";
    // A Tongyi image branch can finish with only a file payload and no text.
    // Preserve that payload so the result parser can render or explain it.
    if (!answer && data.files === undefined && data.metadata === undefined) return null;

    const returnedConversationId = data.conversation_id?.trim();
    return {
      answer,
      ...(returnedConversationId ? { conversationId: returnedConversationId } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      ...(data.files !== undefined ? { files: data.files } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function openDifyStream({
  apiKey,
  apiUrl = DEFAULT_DIFY_API_URL,
  message,
  user,
  conversationId,
  files,
  signal,
  fetchImpl = fetch,
}: GenerateDifyReplyArgs): Promise<Response | null> {
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIFY_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatPayload({ message, user, conversationId, responseMode: "streaming", files })),
    });

    if (!response.ok || !response.body) return null;
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function parseDifyEvent(frame: string): DifyStreamEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;

  try {
    const payload = JSON.parse(data) as {
      event?: unknown;
      answer?: unknown;
      conversation_id?: unknown;
      message?: unknown;
      error?: unknown;
      metadata?: unknown;
      files?: unknown;
      data?: unknown;
      id?: unknown;
      type?: unknown;
      belongs_to?: unknown;
      url?: unknown;
      transfer_method?: unknown;
    };
    const event: DifyStreamEvent = {};
    if (typeof payload.event === "string") event.event = payload.event;
    if (typeof payload.answer === "string" && payload.answer) event.answer = payload.answer;
    if (typeof payload.conversation_id === "string" && payload.conversation_id.trim()) {
      event.conversationId = payload.conversation_id.trim();
    }
    if (typeof payload.error === "string" && payload.error.trim()) event.error = payload.error.trim();
    if (event.event === "error" && !event.error && typeof payload.message === "string") {
      event.error = payload.message.trim();
    }
    if (payload.metadata !== undefined) event.metadata = payload.metadata;
    if (payload.files !== undefined) event.files = payload.files;

    // Dify's streaming image output is a standalone `message_file` event,
    // rather than a `files` array. Normalize it to the file shape consumed by
    // the Tongyi result parser while retaining the original event name.
    if (event.event === "message_file") {
      const nested = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data as Record<string, unknown>
        : undefined;
      const source = nested ?? payload as Record<string, unknown>;
      const url = typeof source.url === "string" ? source.url.trim()
        : typeof source.remote_url === "string" ? source.remote_url.trim()
          : "";
      if (url) {
        const normalizedFile: Record<string, unknown> = {
          type: typeof source.type === "string" && source.type.trim() ? source.type.trim() : "image",
          transfer_method: typeof source.transfer_method === "string" && source.transfer_method.trim()
            ? source.transfer_method.trim()
            : "remote_url",
          url,
        };
        for (const key of ["id", "belongs_to", "name", "mime_type"] as const) {
          const value = source[key];
          if (typeof value === "string" && value.trim()) normalizedFile[key] = value.trim();
        }
        const existingFiles = Array.isArray(event.files) ? event.files : [];
        event.files = [...existingFiles, normalizedFile];
      }
    }
    return Object.keys(event).length ? event : null;
  } catch {
    return null;
  }
}

export async function* parseDifyStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<DifyStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replace(/\r\n?/g, "\n");

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const event = parseDifyEvent(frame);
      if (event) yield event;
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      const event = parseDifyEvent(buffer.trim());
      if (event) yield event;
      return;
    }
  }
}
