/** Shared server-side configuration for text, vision, image and speech APIs. */
/** @param {string | undefined} value */
export function configuredQwenKey(value) {
  const key = value?.trim() ?? "";
  return key && !/\[SENSITIVE\]|your_|placeholder|替换|填写/iu.test(key) ? key : "";
}

export function qwenApiKey() {
  return configuredQwenKey(process.env.QWEN_TTS_API_KEY)
    || configuredQwenKey(process.env.DASHSCOPE_API_KEY)
    || configuredQwenKey(process.env.QWEN_API_KEY);
}

function apiBase() {
  try {
    const url = new URL(process.env.QWEN_API_BASE_URL?.trim() || "https://maas.qianwenaiapi.com/api/v1");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    url.pathname = url.pathname.replace(/\/+$/u, "");
    return url;
  } catch {
    throw new Error("千问 API 地址配置无效");
  }
}

export function qwenMultimodalEndpoint() {
  const url = apiBase();
  url.pathname += "/services/aigc/multimodal-generation/generation";
  return url.toString();
}

export function qwenSpeechEndpoint() {
  const url = apiBase();
  url.pathname += "/services/audio/tts/SpeechSynthesizer";
  return url.toString();
}

export function qwenChatEndpoint() {
  return new URL("/compatible-mode/v1/chat/completions", apiBase()).toString();
}
