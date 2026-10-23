import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function wav(samples: number[], sampleRate = 24000) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => bytes.writeInt16LE(sample, 44 + index * 2));
  return bytes;
}
function request(text: unknown, signal?: AbortSignal) {
  return new Request("http://localhost/api/voice/tts", { method: "POST", body: JSON.stringify({ text }), signal });
}
function synthesisResult(url = "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav") {
  return Response.json({ request_id: "request-1", code: "", message: "", output: {
    text: null, finish_reason: "stop", choices: null,
    audio: { data: "", url, id: "audio-1", expires_at: 2000000000 },
  }, usage: { input_tokens: 0, output_tokens: 0, characters: 2 } });
}

describe("POST /api/voice/tts with Qwen", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubEnv("QWEN_TTS_API_KEY", "private-test-key"); vi.stubEnv("DASHSCOPE_API_KEY", "");
    vi.stubEnv("QWEN_TTS_MODEL", "qwen3-tts-flash"); vi.stubEnv("QWEN_TTS_VOICE", "Mochi");
    vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("defaults to the Qwen-Audio 3.0 speech endpoint and its supported child voice", async () => {
    vi.stubEnv("QWEN_TTS_MODEL", ""); vi.stubEnv("QWEN_TTS_VOICE", "");
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([4, -4]))));
    const response = await POST(request("小朋友，你好。"));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav([4, -4]));
    expect(fetchMock.mock.calls[0][0]).toBe("https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: "qwen-audio-3.0-tts-flash",
      input: {text: "小朋友，你好。", voice: "longpaopao_v3.6", format: "wav", sample_rate: 24000},
    });
  });

  it("uses the configured Qwen-Audio voice and preserves the configured base path", async () => {
    vi.stubEnv("QWEN_API_BASE_URL", "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1");
    vi.stubEnv("QWEN_TTS_MODEL", "qwen-audio-3.0-tts-flash"); vi.stubEnv("QWEN_TTS_VOICE", "longanhuan_v3.6");
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([1]))));
    expect((await POST(request("你好"))).status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({input: {voice: "longanhuan_v3.6", format: "wav"}});
  });

  it("bounds a voice call's stalled synthesis while keeping the longer document timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), {once: true});
    }));
    const call = POST(new Request("http://localhost/api/voice/tts", {
      method: "POST", body: JSON.stringify({text: "你好", voiceCall: true}),
    }));
    await vi.advanceTimersByTimeAsync(12000);
    expect((await call).status).toBe(503);
    const longMessage = POST(request("长消息"));
    await vi.advanceTimersByTimeAsync(12000);
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(108000);
    expect((await longMessage).status).toBe(503);
  });

  it("rejects invalid or oversized text before requesting synthesis", async () => {
    for (const text of [undefined, "   ", 1, {}, "字".repeat(6001)]) expect((await POST(request(text))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/voice/tts", { method: "POST", body: "{" }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns playable Mochi WAV without exposing credentials to the audio host", async () => {
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([1, -2]))));
    const response = await POST(request("  你好  "));
    expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("audio/wav");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav([1, -2]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-test-key");
    expect(JSON.parse(String(init?.body))).toEqual({ model: "qwen3-tts-flash", input: { text: "你好", voice: "Mochi", language_type: "Chinese" } });
    expect(fetchMock.mock.calls[1][0]).toBe("https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).has("Authorization")).toBe(false);
  });
  it("uses shared DashScope credentials and server-configured voice/model", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", ""); vi.stubEnv("DASHSCOPE_API_KEY", "shared-test-key");
    vi.stubEnv("QWEN_TTS_VOICE", "Cherry"); vi.stubEnv("QWEN_TTS_MODEL", "qwen3-tts-flash-2025-11-27");
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([3]))));
    expect((await POST(request("你好"))).status).toBe(200);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer shared-test-key");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ model: "qwen3-tts-flash-2025-11-27", input: { voice: "Cherry" } });
  });
  it("normalizes the streaming WAV size markers returned by the real Qwen service", async () => {
    const audio = wav([100, -100]);
    audio.writeUInt32LE(0x7fffffbf, 4);
    audio.writeUInt32LE(0x7fffff9b, 40);
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(audio)));
    const response = await POST(request("你好"));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav([100, -100]));
  });
  it("splits long replies at sentence boundaries and combines PCM in order", async () => {
    const first = "一".repeat(399) + "。", second = "二".repeat(300) + "。";
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([10, 20]))))
      .mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([30, 40]))));
    const response = await POST(request(first + second));
    expect(response.status).toBe(200); expect(Buffer.from(await response.arrayBuffer())).toEqual(wav([10, 20, 30, 40]));
    const inputs = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)).input.text);
    expect(inputs).toEqual([first, second]);
  });
  it("splits unpunctuated text within the limit without losing surrogate pairs", async () => {
    const text = "😀".repeat(650);
    fetchMock.mockImplementation(async (_url, init) => init?.method === "POST" ? synthesisResult() : new Response(new Uint8Array(wav([5]))));
    expect((await POST(request(text))).status).toBe(200);
    const inputs: string[] = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)).input.text);
    expect(inputs.join("")).toBe(text);
    expect(inputs.every((input) => input.length <= 600 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(input))).toBe(true);
  });
  it("rejects missing credentials without contacting upstream", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", ""); expect((await POST(request("你好"))).status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not leak failures or return partial audio when a later segment fails", async () => {
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([1]))))
      .mockResolvedValueOnce(Response.json({ code: "InvalidApiKey", message: "private-test-key" }, { status: 401 }));
    const response = await POST(request("好".repeat(601)));
    expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "语音服务暂时不可用，请稍后重试。" });
  });
  it.each([
    ["missing audio", () => Response.json({ output: {} })],
    ["invalid JSON", () => new Response("{")],
    ["provider error in HTTP 200", () => Response.json({ code: "InvalidApiKey", output: {} })],
    ["untrusted audio host", () => synthesisResult("http://127.0.0.1/private")],
  ])("rejects %s", async (_name, fixture) => {
    fetchMock.mockResolvedValueOnce(fixture()); expect((await POST(request("你好"))).status).toBe(503); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid WAV instead of treating an error page as speech", async () => {
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response("<html>error</html>"));
    expect((await POST(request("你好"))).status).toBe(503);
  });
  it("rejects mismatched audio formats instead of producing a corrupt merged WAV", async () => {
    fetchMock.mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([1]))))
      .mockResolvedValueOnce(synthesisResult()).mockResolvedValueOnce(new Response(new Uint8Array(wav([2], 16000))));
    expect((await POST(request("好".repeat(601)))).status).toBe(503);
  });
  it("cancels upstream generation when playback is stopped", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); controller.abort();
    }));
    expect((await POST(request("你好", controller.signal))).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("does not synthesize an already canceled request", async () => {
    expect((await POST(request("你好", AbortSignal.abort()))).status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
});
