import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const filename = "STORY-936a1210e0ce.mp4";

function context(value = filename) {
  return { params: Promise.resolve({ filename: value }) };
}

describe("science video proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves a same-origin MP4 response in bounded byte ranges", async () => {
    const upstream = new Response(new Uint8Array([0, 1, 2, 3]), {
      status: 206,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename=${filename}`,
        "Content-Length": "4",
        "Content-Range": "bytes 0-3/1153743",
        "Accept-Ranges": "bytes",
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(`https://www.qyfck.icu/api/science-video/${filename}`),
      context(),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toBe(`inline; filename="${filename}"`);
    expect(response.headers.get("content-range")).toBe("bytes 0-3/1153743");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain(`/science-media-v1/${filename}`);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.redirect).toBe("follow");
    expect((options.headers as Headers).get("range")).toBe("bytes=0-2097151");
  });

  it("caps open-ended browser ranges to keep each streamed response small", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([0]), {
      status: 206,
      headers: { "Content-Range": "bytes 4194304-4194304/8000000" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await GET(
      new Request(`https://www.qyfck.icu/api/science-video/${filename}`, {
        headers: { Range: "bytes=4194304-" },
      }),
      context(),
    );

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Headers).get("range")).toBe("bytes=4194304-6291455");
  });

  it("rejects filenames outside the packaged story format without contacting GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("https://www.qyfck.icu/api/science-video/not-a-video.mp4"),
      context("not-a-video.mp4"),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
