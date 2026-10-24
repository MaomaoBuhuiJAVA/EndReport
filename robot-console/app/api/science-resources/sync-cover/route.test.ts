import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/science-cover-sync", () => ({persistSciencePoetryCoverUrl: vi.fn()}));
import { persistSciencePoetryCoverUrl } from "@/lib/science-cover-sync";
import { POST } from "./route";

afterEach(() => vi.unstubAllGlobals());

it("retires the public cover writeback endpoint without fetching or writing any supplied URL", async () => {
  vi.mocked(persistSciencePoetryCoverUrl).mockResolvedValue({itemId: "POEM-1", title: "风", coverUrl: "https://example.com/cover.png"});
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(new Request("https://site.example/api/science-resources/sync-cover", {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({id: "POEM-1", coverUrl: "https://example.com/cover.png"}),
  }));
  expect(response.status).toBe(410);
  expect(persistSciencePoetryCoverUrl).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
