import { describe, expect, it, vi } from "vitest";
import {
  buildAiChatDocumentDownloadUrl,
  buildAiChatImageDownloadUrl,
  documentDownloadContentType,
  normalizeAiChatDocumentDownload,
} from "./ai-chat-download";

describe("buildAiChatDocumentDownloadUrl", () => {
  it("accepts only a server-issued same-origin token URL", () => {
    expect(
      buildAiChatDocumentDownloadUrl({
        type: "document",
        name: "玩转纸片完整教案.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        url: `/api/ai-chat/artifact?token=${"a".repeat(48)}.1791565200000.${"b".repeat(43)}`,
      }),
    ).toBe(`/api/ai-chat/artifact?token=${"a".repeat(48)}.1791565200000.${"b".repeat(43)}`);

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

  it("accepts a same-origin browser blob URL for a locally generated DOCX", () => {
    vi.stubGlobal("location", { origin: "https://app.local" });
    expect(
      buildAiChatDocumentDownloadUrl({
        type: "document",
        name: "玩转纸片完整教案.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        url: "blob:https://app.local/lesson-plan-1",
      }),
    ).toBe("blob:https://app.local/lesson-plan-1");
    vi.unstubAllGlobals();
  });

  it("renders the independent workflow's signed artifact URL as a download", () => {
    const token = `${"a".repeat(48)}.1791565200000.${"b".repeat(43)}`;
    const url = `/api/ai-chat/artifact?token=${token}`;
    expect(buildAiChatDocumentDownloadUrl({type: "document", name: "磁铁教案.docx", url})).toBe(url);
    expect(buildAiChatDocumentDownloadUrl({type: "document", name: "磁铁教案.docx", url: `${url}&redirect=https://other.example`})).toBeNull();
    expect(buildAiChatDocumentDownloadUrl({type: "document", name: "磁铁教案.docx", url: "/api/ai-chat/artifact?token=invalid"})).toBeNull();
  });

  it("allows a generated image to be opened while rejecting unrelated destinations", () => {
    const url = "https://dashscope-result.oss-cn-beijing.aliyuncs.com/generated.png";
    expect(buildAiChatImageDownloadUrl({type: "image", name: "教学配图.png", mimeType: "image/png", url})).toBe(url);
    expect(buildAiChatImageDownloadUrl({type: "image", name: "教学配图.png", url: "https://untrusted.example/image.png"})).toBeNull();
    expect(buildAiChatImageDownloadUrl({type: "document", name: "文档.docx", url})).toBeNull();
  });

  it("uses a trusted same-origin document filename when its signed URL has no extension", () => {
    const document = normalizeAiChatDocumentDownload({
      type: "document",
      name: "纸片的力量完整教案.docx",
      mimeType: "application/octet-stream",
      url: "https://app.local/api/ai-chat/artifact?token=opaque",
    }, {sameOrigin: "https://app.local"});

    expect(document).toEqual({
      type: "document",
      name: "纸片的力量完整教案.docx",
      mimeType: "application/octet-stream",
      url: "https://app.local/api/ai-chat/artifact?token=opaque",
    });
    expect(documentDownloadContentType(document!)).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });
});
