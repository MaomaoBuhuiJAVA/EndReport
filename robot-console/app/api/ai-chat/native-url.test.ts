import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

it("passes an explicit URL to native document extraction and returns an honest unreadable status", async () => {
  vi.stubEnv("AI_WORKFLOW_PROVIDER", "native");
  const response = await POST(new Request("http://localhost/api/ai-chat", {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({message: "请读取并分析文档", documentUrl: "http://127.0.0.1/private"}),
  }));
  const result = await response.json();
  expect(result.provider).toBe("native");
  expect(result.agentResult).toMatchObject({kind: "degraded", code: "attachment_unavailable"});
  expect(result.attachment?.status).toBe("unavailable");
  expect(result.files).toEqual([]);
});
