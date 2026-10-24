import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/native-workflow/response", () => ({nativeTeachingResponse: vi.fn()}));
import { nativeTeachingResponse } from "@/lib/native-workflow/response";
import { maxDuration, POST } from "./route";

beforeEach(() => {vi.mocked(nativeTeachingResponse).mockReset(); vi.mocked(nativeTeachingResponse).mockReturnValue(Response.json({provider: "native"}));});
afterEach(() => vi.unstubAllEnvs());
function json(body: unknown) {return new Request("http://localhost/api/ai-chat", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});}
function multipart(file: File, extra: Record<string, string> = {}) {
  const form = new FormData(); form.set("message", "识别这份资料"); form.set("attachment", file);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return new Request("http://localhost/api/ai-chat", {method: "POST", body: form});
}

it("keeps enough time for direct image generation", () => {expect(maxDuration).toBeGreaterThanOrEqual(110);});
it("always selects the native workflow regardless of stale provider configuration", async () => {
  vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify"); vi.stubEnv("DIFY_API_KEY", "unused-old-key");
  const request = json({message: "  生成完整教案  ", history: [{role: "user", content: "大班磁铁"}], voiceCall: true, targetResourceId: "POEM-target", documentUrl: "https://school.example/lesson.pdf", workflowState: {task: "resources", query: "查找风的实验", resourceIds: ["EXP-known"]}});
  expect((await POST(request)).status).toBe(200);
  expect(nativeTeachingResponse).toHaveBeenCalledWith(request, expect.objectContaining({message: "生成完整教案", history: [{role: "user", content: "大班磁铁"}], voiceCall: true, targetResourceId: "POEM-target", documentUrl: "https://school.example/lesson.pdf", workflowState: expect.objectContaining({task: "resources", resourceIds: ["EXP-known"]})}));
});
it.each([null, [], {}, {message: 42}, {message: "   "}])("rejects a malformed message before running the workflow", async body => {
  expect((await POST(json(body))).status).toBe(400); expect(nativeTeachingResponse).not.toHaveBeenCalled();
});
it("rejects malformed JSON with a handled response", async () => {
  expect((await POST(new Request("http://localhost/api/ai-chat", {method: "POST", body: "{"}))).status).toBe(400);
});
it("preserves a multipart attachment, history, voice setting and sanitized conversation state", async () => {
  const request = multipart(new File(["风儿轻轻吹"], "poem.txt", {type: "text/plain"}), {history: JSON.stringify([{role: "assistant", content: "我们来看风"}]), voiceCall: "true", targetResourceId: "POEM-target", workflowState: JSON.stringify({task: "resources", query: "风", resourceIds: ["EXP-known"], ignoredSecret: "discard-me"})});
  expect((await POST(request)).status).toBe(200);
  const body = vi.mocked(nativeTeachingResponse).mock.calls[0][1];
  expect(body).toMatchObject({attachment: expect.any(File), voiceCall: true, targetResourceId: "POEM-target", history: [{role: "assistant", content: "我们来看风"}]});
  expect(body.workflowState).not.toHaveProperty("ignoredSecret");
});
it("discards malformed multipart history and state without losing the attachment", async () => {
  expect((await POST(multipart(new File(["poem"], "poem.txt", {type: "text/plain"}), {history: "{", workflowState: "{"}))).status).toBe(200);
  expect(vi.mocked(nativeTeachingResponse).mock.calls[0][1]).toMatchObject({history: [], workflowState: undefined});
});
it.each([
  new File([], "empty.txt", {type: "text/plain"}),
  new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.txt", {type: "text/plain"}),
  new File(["video"], "video.mp4", {type: "video/mp4"}),
  new File(["fake"], "image.png", {type: "text/plain"}),
  new File(["binary"], "program.exe", {type: "application/octet-stream"}),
])("rejects unsupported, oversized or mismatched attachments before execution", async file => {
  expect((await POST(multipart(file))).status).toBe(400); expect(nativeTeachingResponse).not.toHaveBeenCalled();
});
