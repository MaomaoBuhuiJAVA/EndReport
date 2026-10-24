import { qwenApiKey, qwenMultimodalEndpoint, qwenSpeechEndpoint } from "./qwen-config";
const MAX_TEXT_LENGTH = 6000;
const MAX_SEGMENT_LENGTH = 600;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;

export class QwenTtsError extends Error {
  constructor() {
    super("语音服务暂时不可用");
    this.name = "QwenTtsError";
  }
}

export function normalizeTtsText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= MAX_TEXT_LENGTH ? text : null;
}

function splitText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_SEGMENT_LENGTH) {
    let end = MAX_SEGMENT_LENGTH;
    // Keep a Unicode surrogate pair together at a hard boundary.
    if (/[\uD800-\uDBFF]/u.test(remaining[end - 1])) end -= 1;
    const candidate = remaining.slice(0, end);
    const boundary = Math.max(...[...candidate.matchAll(/[。！？!?；;\n]/gu)].map((match) => match.index + 1));
    if (boundary >= end / 2) end = boundary;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

type WavAudio = { format: Buffer; pcm: Buffer };

function parseWav(bytes: Buffer): WavAudio {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new QwenTtsError();
  }
  // Qwen currently downloads a streaming WAV whose size fields are FFmpeg
  // placeholders. Rebuild these fields from the fully downloaded PCM below.
  const streamingSizes = bytes.readUInt32LE(4) === 0x7fffffbf;
  if (!streamingSizes && bytes.readUInt32LE(4) + 8 !== bytes.length) throw new QwenTtsError();
  let format: Buffer | undefined;
  let pcm: Buffer | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const name = bytes.toString("ascii", offset, offset + 4);
    const declaredSize = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const size = streamingSizes && name === "data" && declaredSize === 0x7fffff9b
      ? bytes.length - start : declaredSize;
    if (start + size > bytes.length) throw new QwenTtsError();
    if (name === "fmt ") format = bytes.subarray(start, start + size);
    if (name === "data") pcm = bytes.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || format.length < 16 || !pcm?.length ||
      format.readUInt16LE(0) !== 1 || format.readUInt16LE(14) !== 16) throw new QwenTtsError();
  const channels = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const blockAlign = format.readUInt16LE(12);
  if (!channels || !sampleRate || blockAlign !== channels * 2 ||
      format.readUInt32LE(8) !== sampleRate * blockAlign || pcm.length % blockAlign) throw new QwenTtsError();
  return { format, pcm };
}

function combineWav(chunks: WavAudio[]): Buffer {
  const format = chunks[0].format;
  if (chunks.some((chunk) => !chunk.format.equals(format))) throw new QwenTtsError();
  const pcmSize = chunks.reduce((sum, chunk) => sum + chunk.pcm.length, 0);
  const formatSize = format.length + (format.length % 2);
  const bytes = Buffer.alloc(28 + formatSize + pcmSize);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(format.length, 16);
  format.copy(bytes, 20);
  bytes.write("data", 20 + formatSize);
  bytes.writeUInt32LE(pcmSize, 24 + formatSize);
  let offset = 28 + formatSize;
  for (const chunk of chunks) {
    chunk.pcm.copy(bytes, offset);
    offset += chunk.pcm.length;
  }
  return bytes;
}

function audioUrl(value: unknown): string {
  if (typeof value !== "string") throw new QwenTtsError();
  const url = new URL(value);
  if (!/^dashscope-result[-a-z0-9]*\.oss[-a-z0-9]*\.aliyuncs\.com$/u.test(url.hostname) ||
      !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== "443")) throw new QwenTtsError();
  url.protocol = "https:";
  return url.toString();
}

async function readAudio(response: Response, availableBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get("Content-Length"));
  if (!response.ok || !response.body || contentLength > availableBytes) {
    await response.body?.cancel();
    throw new QwenTtsError();
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > availableBytes) {
        await reader.cancel();
        throw new QwenTtsError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

export async function synthesizeQwenSpeech(
  text: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Buffer> {
  const normalized = normalizeTtsText(text);
  const apiKey = qwenApiKey();
  if (!normalized || !apiKey || options.signal?.aborted) throw new QwenTtsError();
  const model = process.env.QWEN_TTS_MODEL?.trim() || "qwen-audio-3.0-tts-flash";
  const qwenAudio = model.startsWith("qwen-audio-");
  const voice = process.env.QWEN_TTS_VOICE?.trim() || (qwenAudio ? "longpaopao_v3.6" : "Mochi");

  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);
  try {
    const chunks: WavAudio[] = [];
    let totalBytes = 0;
    for (const segment of splitText(normalized)) {
      signal.throwIfAborted();
      const response = await fetch(qwenAudio ? qwenSpeechEndpoint() : qwenMultimodalEndpoint(), {
        method: "POST", signal, cache: "no-store", redirect: "error",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: qwenAudio
            ? { text: segment, voice, format: "wav", sample_rate: 24000 }
            : { text: segment, voice, language_type: "Chinese" },
        }),
      });
      if (!response.ok) throw new QwenTtsError();
      const result = await response.json();
      if (result.code || (result.status_code && result.status_code !== 200)) throw new QwenTtsError();
      const url = audioUrl(result.output?.audio?.url);
      // The signed audio URL already authorizes this download. Never forward the API key.
      const download = await fetch(url, { signal, cache: "no-store", redirect: "error" });
      const bytes = await readAudio(download, MAX_AUDIO_BYTES - totalBytes);
      totalBytes += bytes.length;
      chunks.push(parseWav(bytes));
    }
    signal.throwIfAborted();
    return combineWav(chunks);
  } catch {
    throw new QwenTtsError();
  } finally {
    clearTimeout(timer);
  }
}
