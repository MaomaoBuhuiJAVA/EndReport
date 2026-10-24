import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    scienceKnowledgeItem: { findUnique: vi.fn() },
  },
}));
const ossDriver = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("ali-oss", () => ({ default: class { put = ossDriver.put; } }));

import { prisma } from "@/lib/prisma";
import { persistScienceCoverImage, persistScienceCoverUrl, persistSciencePoetryCoverUrl, synchronizeSciencePoetryCover } from "./science-cover-sync";

const poem = {
  id: "POEM-target",
  baseId: "BASE-target",
  semester: "中班",
  title: "风的旅行",
  sourceFile: "用户提交/科学诗/风的旅行",
  category: "科学诗",
};

describe("science poetry cover synchronization", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "test-oss-id");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "test-oss-secret");
    vi.stubEnv("OSS_MEDIA_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores covers in private OSS with existing credentials and no hosted-storage token", async () => {
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "test-oss-id");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "test-oss-secret");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO0cAAAAASUVORK5CYII=", "base64");
    fetchMock.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
    ossDriver.put.mockResolvedValue({ name: "stored-cover", url: "https://private-bucket.example/not-a-public-url", res: { status: 200 } });

    const url = await persistScienceCoverImage("https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.png", poem.title);

    expect(url).toEqual(expect.stringMatching(/^\/api\/media\/uploads\/science-resource-covers\//u));
    expect(decodeURIComponent(url!)).toMatch(/^\/api\/media\/uploads\/science-resource-covers\/风的旅行-[a-f0-9-]+\.png$/u);
    expect(ossDriver.put).toHaveBeenCalledWith(
      expect.stringMatching(/^uploads\/science-resource-covers\/风的旅行-[a-f0-9-]+\.png$/u),
      png,
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "image/png", "x-oss-object-acl": "private", "x-oss-forbid-overwrite": "true" }) }),
    );

  });

  it("does not fall back to another storage provider when OSS upload fails", async () => {
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_ID", "test-oss-id");
    vi.stubEnv("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "test-oss-secret");
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    ossDriver.put.mockRejectedValue(new Error("OSS unavailable"));


    await expect(persistScienceCoverImage("https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.png", poem.title)).resolves.toBeNull();

  });

  it("writes a durable website media path back to the selected poem", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    const tx = {
      scienceKnowledgeItem: { update: vi.fn().mockResolvedValue(poem) },
      scienceKnowledgeResource: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(tx as never));
    const coverUrl = "/api/media/uploads/science-resource-covers/wind.png";

    await expect(persistSciencePoetryCoverUrl(poem.id, coverUrl)).resolves.toEqual({ itemId: poem.id, title: poem.title, coverUrl });
    expect(tx.scienceKnowledgeResource.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ knowledgeBaseId: "BASE-target", publicPath: coverUrl, externalUrl: coverUrl, isPublic: true }),
    }));
  });

  it("preserves the story auto-cover flow when private OSS replaces public uploads", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue({ ...poem, id: "STORY-target", category: "科学故事" } as never);
    const tx = {
      scienceKnowledgeItem: { update: vi.fn().mockResolvedValue({}) },
      scienceKnowledgeResource: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async callback => callback(tx as never));
    const coverUrl = "/api/media/uploads/science-resource-covers/story.png";
    await expect(persistScienceCoverUrl("STORY-target", coverUrl, "科学故事")).resolves.toEqual({ itemId: "STORY-target", title: poem.title, coverUrl });
    expect(tx.scienceKnowledgeResource.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publicPath: coverUrl, externalUrl: coverUrl }) }));
  });

  it("does not replace another category through the story cover writer", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    await expect(persistScienceCoverUrl(poem.id, "/api/media/uploads/science-resource-covers/story.png", "科学故事")).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    "/api/media/uploads/science-resource-covers/../private.png",
    "/api/media/uploads/science-resource-covers/%2e%2e/private.png",
    "/api/media/uploads/science-resource-covers/%2fprivate.png",
    "/api/media/uploads/science-resource-covers/wind.png?token=unexpected",
    "/api/media/migrated/backup/private.png",
    "//private.example/cover.png",
  ])("does not persist an invalid local cover path: %s", async coverUrl => {
    await expect(persistSciencePoetryCoverUrl(poem.id, coverUrl)).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    "https://dashscope-result.oss-cn-beijing.aliyuncs.com/expiring.png",
    "https://example.com/unverified-cover.png",
    "http://example.com/unverified-cover.png",
  ])("does not save a remote URL as a durable cover: %s", async coverUrl => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    await expect(persistSciencePoetryCoverUrl(poem.id, coverUrl)).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects removed-service URLs before fetching or forwarding any credentials", async () => {
    for (const source of ["https://upload.dify.ai/files/cover.png", "https://media.example.org/cover.png", "http://127.0.0.1/private.png"]) {
      await expect(persistScienceCoverImage(source, poem.title)).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ossDriver.put).not.toHaveBeenCalled();
  });

  it("detects a PNG returned as a generic binary stream", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), {headers: {"content-type": "application/octet-stream"}}));
    const url = await persistScienceCoverImage("https://dashscope-result.oss-cn-beijing.aliyuncs.com/tissue", "测试");
    expect(url).toMatch(/^\/api\/media\/uploads\/science-resource-covers\/.*\.png$/u);
    expect(ossDriver.put.mock.calls[0][2].headers["Content-Type"]).toBe("image/png");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({redirect: "error"});
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has("Authorization")).toBe(false);
  });

  it("updates only the explicitly selected science poem and returns the persisted cover", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/webp" },
    }));

    const tx = {
      scienceKnowledgeItem: { update: vi.fn().mockResolvedValue(poem) },
      scienceKnowledgeResource: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(synchronizeSciencePoetryCover(
      "POEM-target",
      "https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.webp",
    )).resolves.toEqual({
      itemId: "POEM-target",
      title: "风的旅行",
      coverUrl: expect.stringMatching(/^\/api\/media\/uploads\/science-resource-covers\/.*\.webp$/u),
    });

    expect(prisma.scienceKnowledgeItem.findUnique).toHaveBeenCalledWith({ where: { id: "POEM-target" } });
    expect(tx.scienceKnowledgeResource.deleteMany).toHaveBeenCalledWith({
      where: {
        knowledgeBaseId: "BASE-target",
        resourceType: "图片资源",
        title: { contains: "封面" },
      },
    });
    expect(tx.scienceKnowledgeResource.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        knowledgeBaseId: "BASE-target",
        title: "风的旅行 · 封面",
        publicPath: expect.stringMatching(/^\/api\/media\/uploads\/science-resource-covers\/.*\.webp$/u),
        externalUrl: expect.stringMatching(/^\/api\/media\/uploads\/science-resource-covers\/.*\.webp$/u),
      }),
    }));
  });

  it("does not write the catalogue when the provider does not supply a valid image", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    fetchMock.mockResolvedValue(new Response("not an image", {
      headers: { "content-type": "text/plain" },
    }));

    await expect(synchronizeSciencePoetryCover(
      "POEM-target",
      "https://dashscope-result.oss-cn-beijing.aliyuncs.com/not-an-image.txt",
    )).resolves.toBeNull();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not fetch or write when no matching science poem exists", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(null);

    await expect(synchronizeSciencePoetryCover(
      "POEM-missing",
      "https://dashscope-result.oss-cn-beijing.aliyuncs.com/wind.png",
    )).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
