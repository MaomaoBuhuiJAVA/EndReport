import { describe, expect, it } from "vitest";
import {
  buildSignedAiChatDocumentDownloadUrl,
  signAiChatOutputFiles,
  verifyAiChatDownloadToken,
} from "./ai-chat-download-server";

const document = {
  type: "document" as const,
  name: "玩转纸片完整教案.docx",
  mimeType: "application/octet-stream",
  url: "https://upload.dify.ai/files/download?file_id=paper-plan&sign=abc",
};

describe("signed AI chat document downloads", () => {
  it("issues a same-origin token URL without exposing the upstream URL or filename query", () => {
    const downloadUrl = buildSignedAiChatDocumentDownloadUrl(document, {
      apiKey: "test-dify-key",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
      requestUrl: "https://www.qyfck.icu/api/ai-chat",
      now: 1_700_000_000_000,
    });

    expect(downloadUrl).toMatch(/^\/api\/ai-chat\/download\?token=[A-Za-z0-9_.-]+$/u);
    expect(downloadUrl).not.toContain("upload.dify.ai");
    expect(downloadUrl).not.toContain("name=");

    const token = new URL(`https://www.qyfck.icu${downloadUrl!}`).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(verifyAiChatDownloadToken(token!, "test-dify-key", 1_700_000_001_000)).toEqual(document);
  });

  it("rejects tampered and expired tokens", () => {
    const downloadUrl = buildSignedAiChatDocumentDownloadUrl(document, {
      apiKey: "test-dify-key",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
      requestUrl: "https://www.qyfck.icu/api/ai-chat",
      now: 1_700_000_000_000,
      ttlSeconds: 60,
    });
    const token = new URL(`https://www.qyfck.icu${downloadUrl!}`).searchParams.get("token")!;

    expect(verifyAiChatDownloadToken(`${token}tampered`, "test-dify-key", 1_700_000_001_000)).toBeNull();
    expect(verifyAiChatDownloadToken(token, "test-dify-key", 1_700_000_061_000)).toBeNull();
    expect(verifyAiChatDownloadToken(token, "another-key", 1_700_000_001_000)).toBeNull();
  });

  it("does not issue a token for an untrusted upstream document", () => {
    expect(
      buildSignedAiChatDocumentDownloadUrl(
        { ...document, url: "https://untrusted.example/files/lesson.docx" },
        {
          apiKey: "test-dify-key",
          difyApiUrl: "https://api.dify.ai/v1/chat-messages",
          requestUrl: "https://www.qyfck.icu/api/ai-chat",
          now: 1_700_000_000_000,
        },
      ),
    ).toBeNull();
  });

  it("signs documents while preserving image outputs and drops documents without a server secret", () => {
    const image = {
      type: "image" as const,
      name: "封面.png",
      mimeType: "image/png",
      url: "https://upload.dify.ai/files/cover.png",
    };
    const files = signAiChatOutputFiles([document, image], {
      apiKey: "test-dify-key",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
      requestUrl: "https://www.qyfck.icu/api/ai-chat",
      now: 1_700_000_000_000,
    });
    expect(files[0]).toMatchObject({ type: "document", url: expect.stringContaining("/api/ai-chat/download?token=") });
    expect(files[1]).toEqual(image);

    expect(
      signAiChatOutputFiles([document], {
        difyApiUrl: "https://api.dify.ai/v1/chat-messages",
        requestUrl: "https://www.qyfck.icu/api/ai-chat",
      }),
    ).toEqual([]);
  });
});
