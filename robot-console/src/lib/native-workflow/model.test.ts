import { afterEach, describe, expect, it, vi } from "vitest";
import { completeModel, modelConfig, ModelUnavailableError } from "./model";

afterEach(() => vi.unstubAllEnvs());
describe("direct model transport", () => {
  it("uses the shared speech key and Qwen Plus for normal replies even when stale provider configuration exists", () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "shared-key");
    vi.stubEnv("DEEPSEEK_API_KEY", "obsolete-key");
    vi.stubEnv("AI_TEXT_API_URL", "https://obsolete.example/chat/completions");
    expect(modelConfig()).toMatchObject({ key: "shared-key", model: "qwen3.5-plus", url: "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions" });
    expect(modelConfig(true)).toMatchObject({ key: "shared-key", model: "qwen3-vl-flash" });
    expect(modelConfig(false, true)).toMatchObject({ key: "shared-key", model: "qwen-flash" });
  });
  it("delivers split UTF-8 SSE frames in order before completion", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
    let body: Record<string, unknown> = {};
    const deltas: string[] = [];
    const wire = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{"content":"，一起探索。"}}]}\n\ndata: [DONE]\n\n');
    const result = await completeModel({messages:[{role:"user", content:"你好"}], onDelta: t=>{deltas.push(t);}, fetchImpl:async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(new ReadableStream({start(c){c.enqueue(wire.slice(0,48));c.enqueue(wire.slice(48));c.close();}}), {headers:{"content-type":"text/event-stream"}});
    }});
    expect(result).toBe("你好，一起探索。");
    expect(deltas).toEqual(["你好", "，一起探索。"]);
    expect(body.stream).toBe(true);
    expect(body.enable_thinking).toBe(true);
    expect(body.messages).toEqual([{role:"user",content:"你好"}]);
  });
  it("keeps telephone replies on the fast model path without thinking mode", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
    let body: Record<string, unknown> = {};
    await completeModel({messages:[{role:"user",content:"你好"}],voiceCall:true,fetchImpl:async (_url, init)=>{
      body=JSON.parse(String(init?.body));
      return Response.json({choices:[{message:{content:"你好。"}}]});
    }});
    expect(body.model).toBe("qwen-flash");
    expect(body.enable_thinking).toBe(false);
  });
  it("uses a small token budget for calls and propagates caller cancellation", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
    let tokenBudget = 0;
    const abort = new AbortController();
    const result = completeModel({messages:[], voiceCall:true, signal:abort.signal, fetchImpl:async (_url, init)=>{
      tokenBudget=JSON.parse(String(init?.body)).max_tokens;
      return new Promise((_resolve,reject)=>{init?.signal?.addEventListener("abort",()=>reject(new DOMException("Aborted","AbortError")),{once:true});});
    }});
    abort.abort();
    await expect(result).rejects.toThrow();
    expect(tokenBudget).toBeLessThanOrEqual(180);
  });
  it("reports absent configuration without calling any provider", async () => {
    for(const key of ["AI_TEXT_API_KEY","DEEPSEEK_API_KEY","QWEN_API_KEY","DASHSCOPE_API_KEY","QWEN_TTS_API_KEY"]) vi.stubEnv(key, "");
    await expect(completeModel({messages:[]})).rejects.toBeInstanceOf(ModelUnavailableError);
  });
  it("rejects an upstream error without exposing its response body", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "test-key");
    await expect(completeModel({messages:[],fetchImpl:async()=>new Response("private-provider-data",{status:401})})).rejects.toThrow("模型服务返回 401");
  });
});
