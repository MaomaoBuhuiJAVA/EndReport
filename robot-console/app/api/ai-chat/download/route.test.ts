import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { buildSignedAiChatDocumentDownloadUrl } from "@/lib/ai-chat-download-server";
import { MAX_AI_CHAT_DOWNLOAD_BYTES } from "@/lib/ai-chat-download";

const documentUrl = "https://upload.dify.ai/files/paper-plan.docx";
const documentName = "玩转纸片完整教案.docx";
const testApiKey = "route-test-dify-key";

function downloadRequest(url = documentUrl, name = documentName, now = Date.now()) {
  const signedUrl = buildSignedAiChatDocumentDownloadUrl(
    {
      type: "document",
      name,
      url,
    },
    {
      apiKey: testApiKey,
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
      requestUrl: "https://www.qyfck.icu/api/ai-chat",
      now,
    },
  );
  if (!signedUrl) throw new Error("test document could not be signed");
  return new Request(`https://www.qyfck.icu${signedUrl}`);
}

describe("GET /api/ai-chat/download", () => {
  beforeEach(() => {
    process.env.DIFY_API_KEY = testApiKey;
    process.env.DIFY_API_URL = "https://api.dify.ai/v1/chat-messages";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DIFY_API_KEY;
    delete process.env.DIFY_API_URL;
  });

  it("streams a trusted Dify DOCX as a no-store attachment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("generated lesson plan", {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(downloadRequest());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("generated lesson plan");
    expect(fetchMock).toHaveBeenCalledWith(
      documentUrl,
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(response.headers.get("Content-Disposition")).toContain("filename*=UTF-8''");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects an untrusted document address before attempting a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://www.qyfck.icu/api/ai-chat/download?url=https%3A%2F%2Funtrusted.example%2Ffiles%2Funsafe.docx&name=%E5%8D%B1%E9%99%A9%E6%96%87%E4%BB%B6.docx",
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a tampered or expired token before attempting a fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = downloadRequest(documentUrl, documentName, 1_700_000_000_000);
    const token = new URL(request.url).searchParams.get("token")!;

    const tampered = new Request(request.url.replace(token, `${token}tampered`));
    const expiredUrl = buildSignedAiChatDocumentDownloadUrl(
      { type: "document", name: documentName, url: documentUrl },
      {
        apiKey: testApiKey,
        difyApiUrl: "https://api.dify.ai/v1/chat-messages",
        requestUrl: "https://www.qyfck.icu/api/ai-chat",
        now: Date.now() - 5_000,
        ttlSeconds: 1,
      },
    );
    const expired = new Request(`https://www.qyfck.icu${expiredUrl}`);

    await expect(GET(tampered)).resolves.toMatchObject({ status: 400 });
    await expect(GET(expired)).resolves.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a known oversized upstream body from Content-Length", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "Content-Length": String(MAX_AI_CHAT_DOWNLOAD_BYTES + 1) },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(downloadRequest());

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("过大") });
  });

  it("rejects malformed upstream Content-Length values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("generated lesson plan", {
        status: 200,
        headers: { "Content-Length": "12-not-a-size" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(downloadRequest());

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("大小无效") });
  });

  it("bounds an upstream body even when Content-Length is absent", async () => {
    const oversized = new Uint8Array(MAX_AI_CHAT_DOWNLOAD_BYTES + 1);
    const fetchMock = vi.fn().mockResolvedValue(new Response(oversized, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(downloadRequest());

    expect(response.status).toBe(413);
  });

  it("passes request cancellation through and refuses unsafe redirects", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://evil.example" } }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request(downloadRequest().url, { signal: controller.signal });

    const response = await GET(request);

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledWith(
      documentUrl,
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );
  });
});
