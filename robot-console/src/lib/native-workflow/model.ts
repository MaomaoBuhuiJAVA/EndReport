import { qwenApiKey, qwenChatEndpoint } from "@/lib/qwen-config";

export type ModelMessage = {role: "system" | "user" | "assistant"; content: string | Array<{type: "text"; text: string} | {type: "image_url"; image_url: {url: string}}>};
export class ModelUnavailableError extends Error {
  constructor(message = "模型服务尚未配置，请补充相应 API 配置后重试。") { super(message); this.name = "ModelUnavailableError"; }
}

export function modelConfig(vision = false, voiceCall = false) {
  if (vision) return {
    key: qwenApiKey(),
    url: qwenChatEndpoint(),
    model: process.env.QWEN_VISION_MODEL?.trim() || "qwen3-vl-flash",
  };
  return {
    key: qwenApiKey(),
    url: qwenChatEndpoint(),
    model: voiceCall
      ? process.env.QWEN_VOICE_MODEL?.trim() || "qwen-flash"
      : process.env.QWEN_TEXT_MODEL?.trim() || "qwen3.5-plus",
  };
}

export async function completeModel({messages, vision = false, voiceCall = false, json = false, signal, onDelta, maxTokens, fetchImpl = fetch}: {
  messages: ModelMessage[]; vision?: boolean; voiceCall?: boolean; json?: boolean;
  signal?: AbortSignal; onDelta?: (text: string) => void; maxTokens?: number; fetchImpl?: typeof fetch;
}): Promise<string> {
  const config = modelConfig(vision, voiceCall);
  if (!config.key) throw new ModelUnavailableError();
  const controller = new AbortController();
  const timeoutMs = voiceCall ? 12_000 : vision ? 40_000 : 75_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener("abort", cancel, {once:true});
  try {
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const streaming = Boolean(onDelta) && !json;
    const response = await fetchImpl(config.url, {
      method:"POST", signal:controller.signal, cache:"no-store", redirect:"error",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${config.key}`},
      body:JSON.stringify({model:config.model, messages, temperature:voiceCall ? 0.3 : 0.2,
        max_tokens:maxTokens ?? (voiceCall ? 160 : 4000), stream:streaming,
        ...(json ? {response_format:{type:"json_object"}} : {}),
        enable_thinking: !voiceCall,
      }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new ModelUnavailableError(`模型服务返回 ${response.status}，请检查配置或稍后重试。`); }
    if (!streaming || !response.headers.get("content-type")?.includes("event-stream")) {
      const payload = await response.json();
      const text = payload.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new ModelUnavailableError("模型没有返回可用内容，请重试。");
      onDelta?.(text);
      return text.trim();
    }
    if (!response.body) throw new ModelUnavailableError("模型没有返回可读数据。");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "", answer = "", done = false;
    const consume = (line: string) => {
      if (!line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (!data) return;
      if (data === "[DONE]") {done = true; return;}
      const parsed = JSON.parse(data);
      if (parsed.error) throw new ModelUnavailableError("模型处理失败，请稍后重试。");
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string") {answer += delta; onDelta?.(delta);}
    };
    try {
      while (!done) {
        const part = await reader.read();
        pending += decoder.decode(part.value, {stream:!part.done});
        const lines = pending.split(/\r?\n/u); pending = lines.pop() ?? "";
        for (const line of lines) consume(line);
        if (part.done) { if (pending.trim()) consume(pending); break; }
      }
    } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
    if (!answer.trim()) throw new ModelUnavailableError("模型没有返回可用内容，请重试。");
    return answer.trim();
  } finally { clearTimeout(timer); signal?.removeEventListener("abort",cancel); }
}
