import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    scienceKnowledgeItem: { findUnique: vi.fn() },
  },
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { persistScienceCoverImage, synchronizeSciencePoetryCover } from "./science-cover-sync";

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
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies a trusted Dify image to Blob storage before returning its public URL", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/png" },
    }));
    vi.mocked(put).mockResolvedValue({ url: "https://blob.vercel-storage.com/covers/wind.png" } as never);

    await expect(persistScienceCoverImage(
      "https://upload.dify.ai/files/wind.png",
      poem.title,
      { difyApiUrl: "https://api.dify.ai/v1/chat-messages", difyApiKey: "test-dify-key" },
    )).resolves.toBe("https://blob.vercel-storage.com/covers/wind.png");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://upload.dify.ai/files/wind.png",
      expect.objectContaining({ headers: { Authorization: "Bearer test-dify-key" }, redirect: "follow" }),
    );
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^science-resource-covers\/.*\.png$/u),
      expect.any(Blob),
      expect.objectContaining({ access: "public", contentType: "image/png" }),
    );
  });

  it("detects a PNG returned as a generic binary stream", async () => {
    fetchMock.mockResolvedValue(new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
      { headers: { "content-type": "application/octet-stream" } },
    ));
    vi.mocked(put).mockResolvedValue({ url: "https://blob.vercel-storage.com/covers/tissue.png" } as never);

    await expect(persistScienceCoverImage(
      "https://upload.dify.ai/files/tissue",
      "测试",
      { difyApiKey: "test-dify-key" },
    )).resolves.toBe("https://blob.vercel-storage.com/covers/tissue.png");

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/\.png$/u),
      expect.any(Blob),
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("updates only the explicitly selected science poem and returns the persisted cover", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "image/webp" },
    }));
    vi.mocked(put).mockResolvedValue({ url: "https://blob.vercel-storage.com/covers/wind.webp" } as never);
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
      "https://upload.dify.ai/files/wind.webp",
    )).resolves.toEqual({
      itemId: "POEM-target",
      title: "风的旅行",
      coverUrl: "https://blob.vercel-storage.com/covers/wind.webp",
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
        publicPath: "https://blob.vercel-storage.com/covers/wind.webp",
        externalUrl: "https://blob.vercel-storage.com/covers/wind.webp",
      }),
    }));
  });

  it("does not write the catalogue when Dify does not provide a valid image", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(poem as never);
    fetchMock.mockResolvedValue(new Response("not an image", {
      headers: { "content-type": "text/plain" },
    }));

    await expect(synchronizeSciencePoetryCover(
      "POEM-target",
      "https://upload.dify.ai/files/not-an-image.txt",
    )).resolves.toBeNull();

    expect(put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not fetch or write when no matching science poem exists", async () => {
    vi.mocked(prisma.scienceKnowledgeItem.findUnique).mockResolvedValue(null);

    await expect(synchronizeSciencePoetryCover(
      "POEM-missing",
      "https://upload.dify.ai/files/wind.png",
    )).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
