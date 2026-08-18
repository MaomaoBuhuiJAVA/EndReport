import { describe, expect, it } from "vitest";
import {
  buildAiChatDocumentDownloadUrl,
  documentDownloadContentType,
  normalizeDifyDocumentDownload,
} from "./ai-chat-download";

describe("buildAiChatDocumentDownloadUrl", () => {
  it("accepts only a server-issued same-origin token URL", () => {
    expect(
      buildAiChatDocumentDownloadUrl({
        type: "document",
        name: "玩转纸片完整教案.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        url: "/api/ai-chat/download?token=payload.signature",
      }),
    ).toBe("/api/ai-chat/download?token=payload.signature");

    expect(
      buildAiChatDocumentDownloadUrl({
        type: "document",
        name: "危险文件.docx",
        url: "https://untrusted.example/api/ai-chat/download?token=payload.signature",
      }),
    ).toBeNull();

    expect(
      buildAiChatDocumentDownloadUrl({
        type: "document",
        name: "危险文件.docx",
        url: "https://upload.dify.ai/files/unsafe.docx",
      }),
    ).toBeNull();
  });

  it("uses a trusted Dify document filename when its signed URL has no extension", () => {
    const document = normalizeDifyDocumentDownload({
      type: "document",
      name: "纸片的力量完整教案.docx",
      mimeType: "application/octet-stream",
      url: "https://upload.dify.ai/files/4d5e8a70d48a4e73b6eab3f9c8f2e19d?download=1",
    });

    expect(document).toEqual({
      type: "document",
      name: "纸片的力量完整教案.docx",
      mimeType: "application/octet-stream",
      url: "https://upload.dify.ai/files/4d5e8a70d48a4e73b6eab3f9c8f2e19d?download=1",
    });
    expect(documentDownloadContentType(document!)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
