import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { readAiChatResponse } from "@/lib/ai-chat-stream";

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("defaults to the independent workflow even with a legacy Dify key present",async()=>{
  vi.stubEnv("AI_WORKFLOW_PROVIDER","");vi.stubEnv("DIFY_API_KEY","legacy-key");
  const upstream=vi.fn(()=>{throw new Error("Greeting must stay local");});vi.stubGlobal("fetch",upstream);
  const response=await POST(new Request("http://localhost/api/ai-chat",{method:"POST",body:JSON.stringify({message:"你好"})}));
  expect(await response.json()).toMatchObject({provider:"native",reply:expect.stringContaining("科小贝")});
  expect(upstream).not.toHaveBeenCalled();
});
it("ignores a stale legacy provider flag and never revives the removed workflow", async () => {
  vi.stubEnv("AI_WORKFLOW_PROVIDER", "dify");
  vi.stubEnv("DIFY_API_KEY", "legacy-key");
  const upstream = vi.fn(() => {throw new Error("Local greeting must not call any upstream");});
  vi.stubGlobal("fetch", upstream);
  const response = await POST(new Request("http://localhost/api/ai-chat", {method: "POST", body: JSON.stringify({message: "你好"})}));
  expect(await response.json()).toMatchObject({provider: "native", reply: expect.stringContaining("科小贝")});
  expect(upstream).not.toHaveBeenCalled();
});
it("streams native results using the existing client contract",async()=>{
  vi.stubEnv("AI_WORKFLOW_PROVIDER","");
  const response=await POST(new Request("http://localhost/api/ai-chat",{method:"POST",headers:{accept:"text/event-stream"},body:JSON.stringify({message:"你好"})}));
  const result=await readAiChatResponse(response);
  expect(result.provider).toBe("native");expect(result.reply).toContain("科小贝");
});
it("rejects malformed message values instead of throwing outside the handler",async()=>{
  const response=await POST(new Request("http://localhost/api/ai-chat",{method:"POST",body:JSON.stringify({message:42})}));
  expect(response.status).toBe(400);
});

it("carries the topic and confirmed resource through the streamed client response", async () => {
  vi.stubEnv("AI_WORKFLOW_PROVIDER", "");
  vi.stubGlobal("location", {origin: "http://localhost"});
  const response = await POST(new Request("http://localhost/api/ai-chat", {method: "POST", headers: {accept: "text/event-stream"}, body: JSON.stringify({message: "它的全部步骤图", workflowState: {task: "resources", query: "查找《生气的河豚》实验", resourceIds: ["EXP-63f4963e4bd5"]}})}));
  const result = await readAiChatResponse(response);
  expect(result.sources).toEqual(["生气的河豚"]);
  expect(result.photos?.length).toBeGreaterThanOrEqual(4);
  expect(result.workflowState).toMatchObject({task: "resources", resourceIds: ["EXP-63f4963e4bd5"]});
  expect(result.workflowState?.query).toContain("《生气的河豚》");
});
