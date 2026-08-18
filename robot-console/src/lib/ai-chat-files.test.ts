import { describe, expect, it } from "vitest";
import { normalizeDifyOutputFiles, sanitizeDifyOutputDocumentLinks } from "./ai-chat-files";

describe("normalizeDifyOutputFiles", () => {
  it("keeps only supported trusted Dify and app files, up to four", () => {
    expect(
      normalizeDifyOutputFiles(
        [
          {
            type: "document",
            mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            name: "玩转纸片完整教案.docx",
            remote_url: "https://upload.dify.ai/files/paper-plan.docx",
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
            remote_url: "https://upload.dify.ai/files/paper-image.png",
          },
          {
            type: "document",
            name: "不应显示的文件.docx",
            remote_url: "https://untrusted.example/files/unsafe.docx",
          },
          {
            type: "document",
            name: "活动课件.pptx",
            remote_url: "https://upload.dify.ai/files/paper-slides.pptx",
          },
          {
            type: "document",
            name: "材料清单.xlsx",
            remote_url: "https://upload.dify.ai/files/materials.xlsx",
          },
          {
            type: "document",
            name: "不支持的文件.zip",
            remote_url: "https://upload.dify.ai/files/archive.zip",
          },
        ],
        { sameOrigin: "https://www.qyfck.icu/api/ai-chat" },
      ),
    ).toEqual([
      {
        type: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name: "玩转纸片完整教案.docx",
        url: "https://upload.dify.ai/files/paper-plan.docx",
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
        url: "https://upload.dify.ai/files/paper-image.png",
      },
      {
        type: "document",
        name: "活动课件.pptx",
        url: "https://upload.dify.ai/files/paper-slides.pptx",
      },
    ]);
  });

  it("uses a trusted filename extension when Dify returns an opaque signed URL", () => {
    expect(
      normalizeDifyOutputFiles([
        {
          type: "document",
          name: "教案.docx",
          remote_url: "https://upload.dify.ai/files/download?file_id=lesson-plan&sign=abc",
        },
      ]),
    ).toEqual([
      {
        type: "document",
        name: "教案.docx",
        url: "https://upload.dify.ai/files/download?file_id=lesson-plan&sign=abc",
      },
    ]);
  });

  it("accepts a trusted DOCX when Dify reports the generic octet-stream MIME", () => {
    expect(
      normalizeDifyOutputFiles([
        {
          type: "document",
          mime_type: "application/octet-stream",
          name: "教案.docx",
          remote_url: "https://upload.dify.ai/files/download?file_id=lesson-plan&sign=abc.docx",
        },
      ]),
    ).toEqual([
      {
        type: "document",
        mimeType: "application/octet-stream",
        name: "教案.docx",
        url: "https://upload.dify.ai/files/download?file_id=lesson-plan&sign=abc.docx",
      },
    ]);
  });

  it("rejects unknown or conflicting MIME types even when a DOCX extension is present", () => {
    expect(
      normalizeDifyOutputFiles([
        {
          type: "document",
          mime_type: "application/x-unknown-document",
          name: "未知格式.docx",
          remote_url: "https://upload.dify.ai/files/unknown.docx",
        },
        {
          type: "document",
          mime_type: "application/pdf",
          name: "冲突格式.docx",
          remote_url: "https://upload.dify.ai/files/conflict.docx",
        },
      ]),
    ).toEqual([]);
  });

  it("rejects conflicting MIME, URL, and filename formats", () => {
    expect(
      normalizeDifyOutputFiles([
        {
          type: "document",
          mime_type: "application/pdf",
          name: "完整教案.docx",
          remote_url: "https://upload.dify.ai/files/lesson.docx",
        },
        {
          type: "image",
          mime_type: "image/png",
          name: "实验封面.jpg",
          remote_url: "https://upload.dify.ai/files/cover.jpg",
        },
      ]),
    ).toEqual([]);
  });

  it("removes only matched generated-document targets from Markdown", () => {
    const answer = [
      "封面：![图片](https://upload.dify.ai/files/cover.png)",
      "教案：[下载 DOCX](https://upload.dify.ai/files/tools/lesson.docx?sign=abc)",
      "资料：[公开 PDF](https://www.qyfck.icu/downloads/reference.pdf)",
    ].join("\n");

    expect(
      sanitizeDifyOutputDocumentLinks(
        answer,
        [{
          type: "document",
          name: "课件教案.docx",
          remote_url: "https://upload.dify.ai/files/tools/lesson.docx?sign=abc",
        }],
      ),
    ).toBe([
      "封面：![图片](https://upload.dify.ai/files/cover.png)",
      "教案：下载 DOCX",
      "资料：[公开 PDF](https://www.qyfck.icu/downloads/reference.pdf)",
    ].join("\n"));
  });
});
