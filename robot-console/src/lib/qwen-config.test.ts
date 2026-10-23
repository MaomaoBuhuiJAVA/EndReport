import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { qwenApiKey, qwenChatEndpoint, qwenMultimodalEndpoint } from "./qwen-config";

beforeEach(() => {
  for (const name of ["QWEN_TTS_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY", "QWEN_API_BASE_URL"]) vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

it("reuses the speech credential for every Qwen modality", () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "speech-shared-key");
  vi.stubEnv("AI_IMAGE_API_KEY", "obsolete-separate-key");
  vi.stubEnv("DASHSCOPE_API_KEY", "other-key");
  expect(qwenApiKey()).toBe("speech-shared-key");
});

it("accepts the SDK environment name and ignores placeholder keys", () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "[SENSITIVE]");
  vi.stubEnv("DASHSCOPE_API_KEY", "sdk-key");
  expect(qwenApiKey()).toBe("sdk-key");
  vi.stubEnv("DASHSCOPE_API_KEY", "your_api_key");
  expect(qwenApiKey()).toBe("");
});

it("uses the supplied host with the correct SDK and compatible API paths", () => {
  expect(qwenMultimodalEndpoint()).toBe("https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
  expect(qwenChatEndpoint()).toBe("https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions");
  vi.stubEnv("QWEN_API_BASE_URL", "https://dashscope.aliyuncs.com/api/v1/");
  expect(qwenMultimodalEndpoint()).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
  expect(qwenChatEndpoint()).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
});

it.each(["http://maas.qianwenaiapi.com/api/v1", "https://secret@maas.qianwenaiapi.com/api/v1", "https://maas.qianwenaiapi.com/api/v1?key=secret", "invalid"])("rejects an invalid configured endpoint without exposing it: %s", base => {
  vi.stubEnv("QWEN_API_BASE_URL", base);
  expect(() => qwenMultimodalEndpoint()).toThrow("千问 API 地址配置无效");
});
