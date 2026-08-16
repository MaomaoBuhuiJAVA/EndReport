import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/xfyun-tts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/xfyun-tts")>();
  return { ...actual, synthesizeXfyunSpeech: vi.fn() };
});

import { POST } from "./route";
import { synthesizeXfyunSpeech } from "@/lib/xfyun-tts";

describe("POST /api/voice/tts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects absent, empty, or malformed text without contacting the provider", async () => {
    for (const body of [{}, { text: "   " }]) {
      const response = await POST(
        new Request("http://localhost/api/voice/tts", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "请输入需要播报的内容。" });
    }

    const malformed = await POST(
      new Request("http://localhost/api/voice/tts", { method: "POST", body: "{" }),
    );
    expect(malformed.status).toBe(400);
    expect(synthesizeXfyunSpeech).not.toHaveBeenCalled();
  });

  it("maps missing configuration and provider failures to a safe unavailable response", async () => {
    vi.mocked(synthesizeXfyunSpeech).mockRejectedValue(
      new Error("XFYUN_API_SECRET=private-provider-detail"),
    );

    const response = await POST(
      new Request("http://localhost/api/voice/tts", {
        method: "POST",
        body: JSON.stringify({ text: "你好" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ error: "语音服务暂时不可用，请稍后重试。" });
    expect(JSON.stringify(body)).not.toContain("private-provider-detail");
  });

  it("returns provider audio as an uncached MP3 response", async () => {
    vi.mocked(synthesizeXfyunSpeech).mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = await POST(
      new Request("http://localhost/api/voice/tts", {
        method: "POST",
        body: JSON.stringify({ text: "  你好  " }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("audio/mpeg");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.arrayBuffer()).resolves.toEqual(
      Buffer.from([1, 2, 3]).buffer.slice(
        Buffer.from([1, 2, 3]).byteOffset,
        Buffer.from([1, 2, 3]).byteOffset + 3,
      ),
    );
    expect(synthesizeXfyunSpeech).toHaveBeenCalledWith(
      "你好",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
