import { createHmac } from "node:crypto";

export const XFYUN_TTS_ENDPOINT = "wss://tts-api.xfyun.cn/v2/tts";
export const XFYUN_TTS_DEFAULT_VOICE = "x4_doudou";

const MAX_TTS_TEXT_LENGTH = 6000;
const MAX_TTS_AUDIO_BYTES = 12 * 1024 * 1024;

export type XfyunTtsConfig = {
  appId: string;
  apiPassword?: string;
  apiKey?: string;
  apiSecret?: string;
  voice: string;
};

export type XfyunTtsPayload = {
  common: { app_id: string };
  business: {
    aue: "lame";
    auf: "audio/L16;rate=16000";
    vcn: string;
    speed: number;
    volume: number;
    pitch: number;
    bgs: number;
    tte: "UTF8";
  };
  data: { status: 2; text: string };
};

export type XfyunTtsFrame =
  | { kind: "audio"; audio: Buffer }
  | { kind: "finished"; audio: Buffer }
  | { kind: "event"; status?: number }
  | { kind: "error"; code: number };

export type XfyunWebSocketLike = {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

export type XfyunWebSocketFactory = (
  url: string,
  init?: { headers: Record<string, string> },
) => XfyunWebSocketLike;

export type XfyunTtsClientOptions = {
  config?: XfyunTtsConfig;
  endpoint?: string;
  timeoutMs?: number;
  now?: Date;
  webSocketFactory?: XfyunWebSocketFactory;
  signal?: AbortSignal;
};

export class XfyunTtsError extends Error {
  constructor(
    public readonly reason: "aborted" | "configuration" | "upstream" | "protocol" | "timeout",
  ) {
    super("语音服务暂时不可用");
    this.name = "XfyunTtsError";
  }
}

function firstEnvValue(env: Record<string, string | undefined>, names: readonly string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getXfyunTtsConfig(
  env: Record<string, string | undefined> = process.env,
): XfyunTtsConfig | null {
  const appId = firstEnvValue(env, ["XFYUN_APP_ID", "IFLYTEK_APP_ID", "XF_APP_ID"]);
  const apiPassword = firstEnvValue(env, [
    "XFYUN_API_PASSWORD",
    "IFLYTEK_API_PASSWORD",
    "XF_API_PASSWORD",
  ]);
  const apiKey = firstEnvValue(env, ["XFYUN_API_KEY", "IFLYTEK_API_KEY", "XF_API_KEY"]);
  const apiSecret = firstEnvValue(env, ["XFYUN_API_SECRET", "IFLYTEK_API_SECRET", "XF_API_SECRET"]);
  if (!appId || (!apiPassword && (!apiKey || !apiSecret))) return null;

  return {
    appId,
    ...(apiPassword ? { apiPassword } : { apiKey, apiSecret }),
    voice:
      firstEnvValue(env, ["XFYUN_TTS_VOICE", "IFLYTEK_TTS_VOICE", "XF_TTS_VOICE"]) ??
      XFYUN_TTS_DEFAULT_VOICE,
  };
}

export function normalizeTtsText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_TTS_TEXT_LENGTH) return null;
  return text;
}

export function buildXfyunAuthUrl(
  config: XfyunTtsConfig,
  now = new Date(),
  endpoint = XFYUN_TTS_ENDPOINT,
) {
  if (!config.apiKey || !config.apiSecret) throw new XfyunTtsError("configuration");
  const url = new URL(endpoint);
  const date = now.toUTCString();
  const signatureOrigin = `host: ${url.host}\ndate: ${date}\nGET ${url.pathname} HTTP/1.1`;
  const signature = createHmac("sha256", config.apiSecret)
    .update(signatureOrigin)
    .digest("base64");
  const authorizationOrigin =
    `api_key="${config.apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${signature}"`;

  url.searchParams.set("authorization", Buffer.from(authorizationOrigin).toString("base64"));
  url.searchParams.set("date", date);
  url.searchParams.set("host", url.host);
  return url.toString();
}

export function buildXfyunPayload(text: string, config: XfyunTtsConfig): XfyunTtsPayload {
  return {
    common: { app_id: config.appId },
    business: {
      aue: "lame",
      auf: "audio/L16;rate=16000",
      vcn: config.voice,
      speed: 50,
      volume: 50,
      pitch: 50,
      bgs: 0,
      tte: "UTF8",
    },
    data: {
      status: 2,
      text: Buffer.from(text, "utf8").toString("base64"),
    },
  };
}

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new XfyunTtsError("protocol");
}

function asMessageObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      throw new XfyunTtsError("protocol");
    }
    throw new XfyunTtsError("protocol");
  }
  if (value && typeof value === "object") return value as Record<string, unknown>;
  throw new XfyunTtsError("protocol");
}

export function parseXfyunTtsMessage(value: unknown): XfyunTtsFrame {
  const message = asMessageObject(value);
  const code = message.code;
  if (typeof code !== "number") throw new XfyunTtsError("protocol");
  if (code !== 0) return { kind: "error", code };

  const data = message.data;
  if (!data || typeof data !== "object") return { kind: "event" };
  const dataRecord = data as Record<string, unknown>;
  const status = typeof dataRecord.status === "number" ? dataRecord.status : undefined;
  const encodedAudio = typeof dataRecord.audio === "string" ? dataRecord.audio : "";
  let audio = Buffer.alloc(0);
  if (encodedAudio) {
    try {
      audio = Buffer.from(encodedAudio, "base64");
    } catch {
      throw new XfyunTtsError("protocol");
    }
  }

  if (status === 2) return { kind: "finished", audio };
  if (audio.length) return { kind: "audio", audio };
  return { kind: "event", status };
}

export function concatXfyunAudioChunks(chunks: readonly Uint8Array[]): Buffer {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total > MAX_TTS_AUDIO_BYTES) throw new XfyunTtsError("protocol");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function defaultWebSocketFactory(
  url: string,
  init: { headers: Record<string, string> } = { headers: {} },
): XfyunWebSocketLike {
  const WebSocketConstructor = globalThis.WebSocket as unknown as
    | (new (url: string, init?: { headers: Record<string, string> }) => XfyunWebSocketLike)
    | undefined;
  if (!WebSocketConstructor) throw new XfyunTtsError("configuration");
  return new WebSocketConstructor(url, init);
}

function toText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return asBuffer(value).toString("utf8");
  }
  return null;
}

export async function synthesizeXfyunSpeech(
  text: string,
  options: XfyunTtsClientOptions = {},
): Promise<Buffer> {
  const normalizedText = normalizeTtsText(text);
  if (!normalizedText) throw new XfyunTtsError("protocol");
  if (options.signal?.aborted) throw new XfyunTtsError("aborted");

  const config = options.config ?? getXfyunTtsConfig();
  if (!config) throw new XfyunTtsError("configuration");

  const endpoint = options.endpoint ?? XFYUN_TTS_ENDPOINT;
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const authUrl = config.apiPassword
    ? endpoint
    : buildXfyunAuthUrl(config, options.now, endpoint);
  const headers: Record<string, string> = config.apiPassword
    ? { "X-Api-Key": config.apiPassword }
    : {};
  let socket: XfyunWebSocketLike;
  try {
    socket = factory(authUrl, { headers });
  } catch {
    throw new XfyunTtsError("upstream");
  }

  socket.binaryType = "arraybuffer";
  const chunks: Buffer[] = [];
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new XfyunTtsError("timeout")), timeoutMs);
    const abortSignal = options.signal;

    function closeSocket() {
      try {
        socket.close();
      } catch {
        // Closing an already-closed socket is harmless.
      }
    }

    function removeAbortListener() {
      abortSignal?.removeEventListener("abort", handleAbort);
    }

    function fail(error: XfyunTtsError) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeAbortListener();
      closeSocket();
      reject(error);
    }

    function succeed(lastAudio: Buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeAbortListener();
      if (lastAudio.length) chunks.push(lastAudio);
      try {
        resolve(concatXfyunAudioChunks(chunks));
      } catch (error) {
        reject(error instanceof XfyunTtsError ? error : new XfyunTtsError("protocol"));
      } finally {
        closeSocket();
      }
    }

    function handleAbort() {
      fail(new XfyunTtsError("aborted"));
    }

    function handleMessage(value: unknown) {
      try {
        const frame = parseXfyunTtsMessage(value);
        if (frame.kind === "audio") chunks.push(frame.audio);
        else if (frame.kind === "finished") succeed(frame.audio);
        else if (frame.kind === "error") fail(new XfyunTtsError("upstream"));
      } catch (error) {
        fail(error instanceof XfyunTtsError ? error : new XfyunTtsError("protocol"));
      }
    }

    abortSignal?.addEventListener("abort", handleAbort, { once: true });
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify(buildXfyunPayload(normalizedText, config)));
      } catch {
        fail(new XfyunTtsError("upstream"));
      }
    };
    socket.onmessage = (event) => {
      const message = toText(event.data);
      if (message === null) {
        if (typeof Blob !== "undefined" && event.data instanceof Blob) {
          void event.data
            .arrayBuffer()
            .then((buffer) => handleMessage(Buffer.from(buffer).toString("utf8")))
            .catch(() => fail(new XfyunTtsError("protocol")));
        } else {
          fail(new XfyunTtsError("protocol"));
        }
        return;
      }
      handleMessage(message);
    };
    socket.onerror = () => fail(new XfyunTtsError("upstream"));
    socket.onclose = () => fail(new XfyunTtsError("upstream"));
  });
}
