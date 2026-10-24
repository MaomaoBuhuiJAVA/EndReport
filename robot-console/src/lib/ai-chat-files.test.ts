import { describe, expect, it } from "vitest";
import { normalizeAiChatOutputFiles as normalizeFiles, sanitizeAiChatOutputDocumentLinks as sanitizeLinks, type NormalizeAiChatOutputFilesOptions } from "./ai-chat-files";
const normalizeAiChatOutputFiles = (files: unknown, options: NormalizeAiChatOutputFilesOptions = {}) => normalizeFiles(files, {sameOrigin: "https://www.qyfck.icu", ...options});
const sanitizeAiChatOutputDocumentLinks = (answer: unknown, files: unknown, options: NormalizeAiChatOutputFilesOptions = {}) => sanitizeLinks(answer, files, {sameOrigin: "https://www.qyfck.icu", ...options});

describe("normalizeAiChatOutputFiles", () => {
  it("keeps only supported trusted server and app files, up to four", () => {
    expect(
      normalizeAiChatOutputFiles(
        [
          {
            type: "document",
            mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            name: "玩转纸片完整教案.docx",
            remote_url: "https://www.qyfck.icu/files/paper-plan.docx",
          },
          {
            type: "document",
            mime_type: "application/pdf",
            name: "活动观察表.pdf",
            remote_url: "https://www.qyfck.icu/downloads/observation.pdf",
          },
          {
            type: "image",
            mime_type: "image/png",
            name: "实验示意图.png",
            remote_url: "https://www.qyfck.icu/files/paper-image.png",
          },
          {
            type: "document",
            name: "不应显示的文件.docx",
            remote_url: "https://untrusted.example/files/unsafe.docx",
          },
          {
            type: "document",
            name: "活动课件.pptx",
            remote_url: "https://www.qyfck.icu/files/paper-slides.pptx",
          },
          {
            type: "document",
            name: "材料清单.xlsx",
            remote_url: "https://www.qyfck.icu/files/materials.xlsx",
          },
          {
            type: "document",
            name: "不支持的文件.zip",
            remote_url: "https://www.qyfck.icu/files/archive.zip",
          },
        ],
        { sameOrigin: "https://www.qyfck.icu/api/ai-chat" },
      ),
    ).toEqual([
      {
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "玩转纸片完整教案.docx",
        url: "https://www.qyfck.icu/files/paper-plan.docx",
      },
      {
        type: "document",
        mimeType: "application/pdf",
        name: "活动观察表.pdf",
        url: "https://www.qyfck.icu/downloads/observation.pdf",
      },
      {
        type: "image",
        mimeType: "image/png",
        name: "实验示意图.png",
        url: "https://www.qyfck.icu/files/paper-image.png",
      },
      {
        type: "document",
        name: "活动课件.pptx",
        url: "https://www.qyfck.icu/files/paper-slides.pptx",
      },
    ]);
  });

  it("uses a trusted filename extension when server returns an opaque signed URL", () => {
    expect(
      normalizeAiChatOutputFiles([
        {
          type: "document",
          name: "教案.docx",
          remote_url: "https://www.qyfck.icu/files/download?file_id=lesson-plan&sign=abc",
        },
      ]),
    ).toEqual([
      {
        type: "document",
        name: "教案.docx",
        url: "https://www.qyfck.icu/files/download?file_id=lesson-plan&sign=abc",
      },
    ]);
  });

  it("accepts a trusted DOCX when server reports the generic octet-stream MIME", () => {
    expect(
      normalizeAiChatOutputFiles([
        {
          type: "document",
          mime_type: "application/octet-stream",
          name: "教案.docx",
          remote_url: "https://www.qyfck.icu/files/download?file_id=lesson-plan&sign=abc.docx",
        },
      ]),
    ).toEqual([
      {
        type: "document",
        mimeType: "application/octet-stream",
        name: "教案.docx",
        url: "https://www.qyfck.icu/files/download?file_id=lesson-plan&sign=abc.docx",
      },
    ]);
  });

  it("rejects unknown or conflicting MIME types even when a DOCX extension is present", () => {
    expect(
      normalizeAiChatOutputFiles([
        {
          type: "document",
          mime_type: "application/x-unknown-document",
          name: "未知格式.docx",
          remote_url: "https://www.qyfck.icu/files/unknown.docx",
        },
        {
          type: "document",
          mime_type: "application/pdf",
          name: "冲突格式.docx",
          remote_url: "https://www.qyfck.icu/files/conflict.docx",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects conflicting MIME, URL, and filename formats", () => {
    expect(
      normalizeAiChatOutputFiles([
        {
          type: "document",
          mime_type: "application/pdf",
          name: "完整教案.docx",
          remote_url: "https://www.qyfck.icu/files/lesson.docx",
        },
        {
          type: "image",
          mime_type: "image/png",
          name: "实验封面.jpg",
          remote_url: "https://www.qyfck.icu/files/cover.jpg",
        },
      ]),
    ).toEqual([]);
  });

  it("removes only matched generated-document targets from Markdown", () => {
    const answer = [
      "封面：![图片](https://www.qyfck.icu/files/cover.png)",
      "教案：[下载 DOCX](https://www.qyfck.icu/files/tools/lesson.docx?sign=abc)",
      "资料：[公开 PDF](https://www.qyfck.icu/downloads/reference.pdf)",
    ].join("\n");

    expect(
      sanitizeAiChatOutputDocumentLinks(
        answer,
        [{
          type: "document",
          name: "课件教案.docx",
          remote_url: "https://www.qyfck.icu/files/tools/lesson.docx?sign=abc",
        }],
      ),
    ).toBe([
      "封面：![图片](https://www.qyfck.icu/files/cover.png)",
      "教案：下载 DOCX",
      "资料：[公开 PDF](https://www.qyfck.icu/downloads/reference.pdf)",
    ].join("\n"));
  });
});
