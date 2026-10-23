import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  scienceKnowledgeResource: { findFirst: vi.fn() },
  studentWork: { findFirst: vi.fn() },
} }));
const oss = vi.hoisted(() => ({ signatureUrl: vi.fn() }));
vi.mock("@/lib/oss-media", async (original) => ({
  ...await original<object>(),
  createOssClient: () => ({ signatureUrl: oss.signatureUrl }),
}));
vi.mock("@/data/oss-media-manifest.json", () => ({ default: [
  { key: "migrated/public/video.mp4", sourceUrl: "https://old.example/video.mp4", publicCatalog: true },
  { key: "migrated/legacy-media/store/science-resources/stories/STORY-a.mp4", sourcePath: "/science-resources/stories/STORY-a.mp4", publicCatalog: true },
  { key: "migrated/private/photo.png", sourceUrl: "https://old.example/photo.png", publicCatalog: false },
  { key: "migrated/legacy-media/store/science-resource-covers/fan.png", sourcePath: "/science-resource-covers/fan.png", publicCatalog: false },
  { key: "migrated/private/student-works/parent/待审作品.png", sourceUrl: "https://old.example/private-work.png", publicCatalog: true },
] }));

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("private OSS media access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oss.signatureUrl.mockReturnValue("https://private-storage.example/signed-test");
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.studentWork.findFirst).mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("streams public catalog video ranges without leaking a signed storage address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("part", { status: 206, headers: {
      "content-type": "video/mp4", "content-range": "bytes 0-3/8", "content-length": "4",
      "content-disposition": "attachment", "x-oss-force-download": "true",
    } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("https://site.example/api/media/migrated/public/video.mp4", { headers: { Range: "bytes=0-3" } }),
      { params: Promise.resolve({ key: ["migrated", "public", "video.mp4"] }) });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("part");
    expect(response.headers.get("content-range")).toBe("bytes 0-3/8");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.has("location")).toBe(false);
    expect(response.headers.has("x-oss-force-download")).toBe(false);
    expect(fetchMock.mock.calls[0][1].headers.get("range")).toBe("bytes=0-3");
  });

  it("serves a neutral media route from its neutral OSS object key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("video", { headers: { "content-type": "video/mp4" } })));
    const response = await GET(new Request("https://site.example/api/media/migrated/legacy-media/store/science-resources/stories/STORY-a.mp4"),
      { params: Promise.resolve({ key: ["migrated", "legacy-media", "store", "science-resources", "stories", "STORY-a.mp4"] }) });
    expect(response.status).toBe(200);
    expect(oss.signatureUrl).toHaveBeenCalledWith("migrated/legacy-media/store/science-resources/stories/STORY-a.mp4", { expires: 60 });
  });

  it("maps an older migrated route to its neutral object path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("video", { headers: { "content-type": "video/mp4" } })));
    const response = await GET(new Request("https://site.example/api/media/migrated/archive/old-store/science-resources/stories/STORY-a.mp4"),
      { params: Promise.resolve({ key: ["migrated", "archive", "old-store", "science-resources", "stories", "STORY-a.mp4"] }) });
    expect(response.status).toBe(200);
    expect(oss.signatureUrl).toHaveBeenCalledWith("migrated/legacy-media/store/science-resources/stories/STORY-a.mp4", { expires: 60 });
  });

  it("authorizes an old source URL by its media path without storing its host", async () => {
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockImplementation(args => {
      const conditions = args?.where?.OR as Array<{ externalUrl?: { endsWith?: string } }> | undefined;
      const sourcePath = conditions?.find(condition => condition.externalUrl?.endsWith)?.externalUrl?.endsWith;
      return Promise.resolve(sourcePath === "/science-resource-covers/fan.png" ? { id: "public-fan-cover" } : null) as never;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("cover", { headers: { "content-type": "image/png" } })));
    const response = await GET(new Request("https://site.example/api/media/migrated/legacy-media/store/science-resource-covers/fan.png"),
      { params: Promise.resolve({ key: ["migrated", "legacy-media", "store", "science-resource-covers", "fan.png"] }) });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("cover");
  });

  it("never reads OSS for an unlisted object or a private record denied by the database", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const key of [["migrated", "private", "photo.png"], ["migrated", "unknown", "photo.png"], ["uploads", "..", "secret"]]) {
      const response = await GET(new Request("https://site.example/api/media/file"), { params: Promise.resolve({ key }) });
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("plays migrated GitHub videos served by OSS as generic binary files", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("video", { headers: {
      "content-type": "application/octet-stream", "content-disposition": "attachment",
    } })));
    const response = await GET(new Request("https://site.example/api/media/migrated/public/video.mp4"),
      { params: Promise.resolve({ key: ["migrated", "public", "video.mp4"] }) });
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toBe("inline");
  });

  it("fails closed when the database cannot verify a private file", async () => {
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockRejectedValue(new Error("database down"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("https://site.example/api/media/file"),
      { params: Promise.resolve({ key: ["migrated", "private", "photo.png"] }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a newly generated OSS cover only after its public database reference exists", async () => {
    const path = "/api/media/uploads/science-resource-covers/wind.png";
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockResolvedValue({ id: "RESOURCE-new-cover" } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("cover-bytes", { headers: { "content-type": "image/png" } })));

    const response = await GET(new Request(`https://site.example${path}`),
      { params: Promise.resolve({ key: ["uploads", "science-resource-covers", "wind.png"] }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("cover-bytes");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.has("location")).toBe(false);
    expect(prisma.scienceKnowledgeResource.findFirst).toHaveBeenCalledWith({
      where: { isPublic: true, OR: [{ publicPath: { in: [path, `https://site.example${path}`] } }, { externalUrl: { in: [path, `https://site.example${path}`] } }] },
      select: { id: true },
    });
  });

  it("cannot authorize an unrelated upload using a blank catalogue reference", async () => {
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockImplementation(args => {
      const references = (args?.where?.OR?.[0]?.publicPath as { in?: string[] } | undefined)?.in ?? [];
      return Promise.resolve(references.includes("") ? { id: "unrelated-public-resource" } : null) as never;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("https://site.example/api/media/uploads/science-resource-covers/unreferenced.png"),
      { params: Promise.resolve({ key: ["uploads", "science-resource-covers", "unreferenced.png"] }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for a new upload when the database is unavailable", async () => {
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockRejectedValue(new Error("database down"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("https://site.example/api/media/uploads/science-resource-covers/wind.png"),
      { params: Promise.resolve({ key: ["uploads", "science-resource-covers", "wind.png"] }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["uploads", "student-works", "parent", "待审作品.png"],
    ["migrated", "private", "student-works", "parent", "待审作品.png"],
    ["migrated", "private", "photo.png"],
  ])("does not let a public catalogue reference expose a pending internal student work (%s)", async (...key) => {
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockResolvedValue({ id: "public-poem" } as never);
    vi.mocked(prisma.studentWork.findFirst).mockResolvedValue({ ownerId: "parent", status: "PENDING", visibility: "INTERNAL" } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("https://site.example/api/media/file"), { params: Promise.resolve({ key }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["parent", "PARENT"],
    ["admin", "ADMIN"],
  ])("keeps owner/admin work delivery private even if a public catalogue references it (%s)", async (id, role) => {
    vi.mocked(getSessionUser).mockResolvedValue({ id, role } as never);
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockResolvedValue({ id: "public-poem" } as never);
    vi.mocked(prisma.studentWork.findFirst).mockResolvedValue({ ownerId: "parent", status: "PENDING", visibility: "INTERNAL" } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-work", { headers: { "content-type": "image/png" } })));

    const response = await GET(new Request("https://site.example/api/media/file"),
      { params: Promise.resolve({ key: ["uploads", "student-works", "parent", "photo.png"] }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("private-work");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("serves an approved public work whose database URL is absolute and has an encoded filename", async () => {
    const storedUrl = "https://site.example/api/media/uploads/student-works/parent/%E4%BD%9C%E5%93%81.png";
    vi.mocked(prisma.studentWork.findFirst).mockImplementation(args => {
      const urls = (args?.where?.OR?.[0]?.mediaUrl as { in?: string[] } | undefined)?.in ?? [];
      return Promise.resolve(urls.includes(storedUrl)
        ? { ownerId: "parent", status: "APPROVED", visibility: "PUBLIC" } : null) as never;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("approved-work", { headers: { "content-type": "image/png" } })));

    const response = await GET(new Request(storedUrl),
      { params: Promise.resolve({ key: ["uploads", "student-works", "parent", "作品.png"] }) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("approved-work");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it.each([
    ["uploads", "student-works", "parent", "unregistered.png"],
    ["migrated", "private", "student-works", "parent", "待审作品.png"],
  ])("requires an actual work record for the student-work namespace (%s)", async (...key) => {
    vi.mocked(prisma.scienceKnowledgeResource.findFirst).mockResolvedValue({ id: "public-poem" } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("https://site.example/api/media/file"), { params: Promise.resolve({ key }) });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
