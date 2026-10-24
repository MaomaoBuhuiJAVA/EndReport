import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs();});
it("retires the old hosted-workflow download without contacting any upstream", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream); vi.stubEnv("DIFY_API_KEY", "unused-key");
  const response = GET();
  expect(response.status).toBe(410); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({error: expect.stringContaining("重新生成")});
  expect(upstream).not.toHaveBeenCalled();
});
