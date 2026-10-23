import { describe, expect, it } from "vitest";
import {
  createScienceResourceIds,
  publicResourceUrl,
  validateScienceResourceSubmit,
} from "./science-resource-submit";

describe("science resource submission validation", () => {
  it("accepts a complete science poem and its public cover URL", () => {
    const result = validateScienceResourceSubmit({
      category: "科学诗",
      title: "风的旅行",
      ageLabel: "中班",
      topic: "风和空气",
      author: "小朋友",
      body: "风儿轻轻吹，叶子跳起舞。",
      coverUrl: "https://example.com/cover.webp",
      documentUrl: "/uploads/wind.docx",
      supportingUrl: "https://example.com/wind-notes.pdf",
      supportingName: "教学提示.pdf",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        category: "科学诗",
        title: "风的旅行",
        coverUrl: "https://example.com/cover.webp",
        documentUrl: "/uploads/wind.docx",
        supportingUrl: "https://example.com/wind-notes.pdf",
      },
    });
  });

  it("requires a video for a science story", () => {
    expect(validateScienceResourceSubmit({
      category: "科学故事",
      title: "小水滴旅行记",
      ageLabel: "大班",
      topic: "水循环",
      body: "故事文本",
    })).toEqual({ ok: false, error: "科学故事需要提供视频地址或上传视频" });
  });

  it("rejects non-public URLs and unsupported age groups", () => {
    expect(publicResourceUrl("javascript:alert(1)")).toBe("");
    expect(publicResourceUrl("http://example.com/cover.png")).toBe("");
    expect(publicResourceUrl("https://example.com/cover.png")).toBe("https://example.com/cover.png");
    expect(validateScienceResourceSubmit({
      category: "科学诗",
      title: "泡泡",
      ageLabel: "一年级",
      topic: "空气",
      body: "泡泡飞呀飞",
    })).toEqual({ ok: false, error: "请选择有效的年龄段" });
  });

  it("generates catalogue-compatible resource IDs", () => {
    const ids = createScienceResourceIds("POEM");
    expect(ids.id).toMatch(/^POEM-[a-f0-9]{12}$/);
    expect(ids.baseId).toMatch(/^BASE-[a-f0-9]{12}$/);
  });

  it.each([
    "/api/media/uploads/student-works/parent/photo.png",
    "https://site.example/api/media/uploads/student-works/parent/%E4%BD%9C%E5%93%81.png",
    "/api/media/migrated/private/student-works/parent/photo.png",
    "/api/media/uploads/student%2Dworks/parent/photo.png",
  ])("does not accept a private student-work URL into the public catalogue (%s)", (url) => {
    expect(publicResourceUrl(url)).toBe("");
  });

  it.each(["videoUrl", "coverUrl", "documentUrl", "supportingUrl"])("rejects a student-work reference in %s", (field) => {
    const result = validateScienceResourceSubmit({
      category: "科学诗", title: "风的旅行", ageLabel: "中班", topic: "风", body: "风吹树叶。",
      [field]: "/api/media/uploads/student-works/parent/photo.png",
    });
    expect(result.ok).toBe(false);
  });
});
