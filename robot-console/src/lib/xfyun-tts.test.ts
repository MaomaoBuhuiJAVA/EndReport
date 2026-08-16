import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  XFYUN_TTS_DEFAULT_VOICE,
  XFYUN_TTS_ENDPOINT,
  buildXfyunAuthUrl,
  buildXfyunPayload,
  getXfyunTtsConfig,
  parseXfyunTtsMessage,
  synthesizeXfyunSpeech,
} from "./xfyun-tts";
import type { XfyunTtsConfig, XfyunWebSocketFactory, XfyunWebSocketLike } from "./xfyun-tts";

const passwordConfig: XfyunTtsConfig = {
  appId: "app-id",
  apiPassword: "api-password",
  voice: XFYUN_TTS_DEFAULT_VOICE,
};
const legacyConfig: XfyunTtsConfig = {
  appId: "app-id",
  apiKey: "api-key",
  apiSecret: "api-secret",
  voice: XFYUN_TTS_DEFAULT_VOICE,
};

describe("讯飞 TTS configuration and protocol", () => {
  it("accepts the APIPassword plus APPID and defaults to the 豆豆 voice", () => {
    expect(getXfyunTtsConfig({})).toBeNull();
    expect(
      getXfyunTtsConfig({
        XFYUN_APP_ID: "app-id",
        XFYUN_API_PASSWORD: "api-password",
      }),
    ).toEqual(passwordConfig);
    expect(
      getXfyunTtsConfig({
        XFYUN_APP_ID: "app-id",
        XFYUN_API_KEY: "api-key",
        XFYUN_API_SECRET: "api-secret",
      }),
    ).toEqual(legacyConfig);
  });

  it("builds the signed WebSocket URL without exposing the API secret", () => {
    const now = new Date("2026-08-16T00:00:00.000Z");
    const url = new URL(buildXfyunAuthUrl(legacyConfig, now));
    const date = "Sun, 16 Aug 2026 00:00:00 GMT";
    const signatureOrigin = `host: tts-api.xfyun.cn\ndate: ${date}\nGET /v2/tts HTTP/1.1`;
    const signature = createHmac("sha256", legacyConfig.apiSecret ?? "")
      .update(signatureOrigin)
      .digest("base64");
    const authorization = Buffer.from(
      `api_key="${legacyConfig.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`,
    ).toString("base64");

    expect(url.origin + url.pathname).toBe(XFYUN_TTS_ENDPOINT);
    expect(url.searchParams.get("date")).toBe(date);
    expect(url.searchParams.get("host")).toBe("tts-api.xfyun.cn");
    expect(url.searchParams.get("authorization")).toBe(authorization);
    expect(url.toString()).not.toContain(legacyConfig.apiSecret);
  });

  it("encodes UTF-8 text and fixes the x4_doudou MP3 request", () => {
    const payload = buildXfyunPayload("你好", passwordConfig);
    expect(payload.common).toEqual({ app_id: "app-id" });
    expect(payload.business).toMatchObject({
      aue: "lame",
      vcn: XFYUN_TTS_DEFAULT_VOICE,
      tte: "UTF8",
    });
    expect(Buffer.from(payload.data.text, "base64").toString("utf8")).toBe("你好");
    expect(payload.data.status).toBe(2);
  });

  it("parses ordered base64 audio, completion, and sanitized provider errors", () => {
    expect(parseXfyunTtsMessage(JSON.stringify({ code: 0, data: { audio: Buffer.from([1, 2]).toString("base64"), status: 1 } }))).toEqual({
      kind: "audio",
      audio: Buffer.from([1, 2]),
    });
    expect(parseXfyunTtsMessage(JSON.stringify({ code: 0, data: { audio: Buffer.from([3]).toString("base64"), status: 2 } }))).toEqual({
      kind: "finished",
      audio: Buffer.from([3]),
    });
    const failed = parseXfyunTtsMessage(JSON.stringify({ code: 10106, message: "private provider detail" }));
    expect(failed).toEqual({ kind: "error", code: 10106 });
    expect(JSON.stringify(failed)).not.toContain("private provider detail");
  });
});

describe("synthesizeXfyunSpeech", () => {
  beforeEach(() => vi.restoreAllMocks());

  function socketHarness() {
    const send = vi.fn<(data: string) => void>();
    const close = vi.fn<(code?: number, reason?: string) => void>();
    const socket: XfyunWebSocketLike = {
      binaryType: "",
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send,
      close,
    };
    const factory: XfyunWebSocketFactory = vi.fn(() => socket);
    return { socket, send, close, factory };
  }

  it("sends one JSON request and concatenates MP3 audio until status 2", async () => {
    const { socket, send, close, factory } = socketHarness();
    const promise = synthesizeXfyunSpeech("你好", {
      config: passwordConfig,
      now: new Date("2026-08-16T00:00:00.000Z"),
      webSocketFactory: factory,
      timeoutMs: 500,
    });

    socket.onopen?.();
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      common: { app_id: "app-id" },
      business: { vcn: XFYUN_TTS_DEFAULT_VOICE },
    });
    socket.onmessage?.({ data: JSON.stringify({ code: 0, data: { audio: Buffer.from([1, 2]).toString("base64"), status: 1 } }) });
    socket.onmessage?.({ data: JSON.stringify({ code: 0, data: { audio: Buffer.from([3]).toString("base64"), status: 2 } }) });

    await expect(promise).resolves.toEqual(Buffer.from([1, 2, 3]));
    expect(close).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith(
      expect.stringContaining("tts-api.xfyun.cn/v2/tts"),
      { headers: { "X-Api-Key": "api-password" } },
    );
  });

  it("closes the upstream socket when the caller aborts", async () => {
    const { socket, close, factory } = socketHarness();
    const controller = new AbortController();
    const promise = synthesizeXfyunSpeech("你好", {
      config: passwordConfig,
      signal: controller.signal,
      webSocketFactory: factory,
      timeoutMs: 500,
    });

    socket.onopen?.();
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "XfyunTtsError", reason: "aborted" });
    expect(close).toHaveBeenCalledOnce();
  });
});
