import type { ConversationMessage } from "@/lib/types";

type GenerateDeepSeekReplyArgs = {
  apiKey?: string;
  apiUrl?: string;
  systemPrompt: string;
  context: string;
  history: ConversationMessage[];
  message: string;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 30_000;

function configuredSecret(value?: string) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized !== "[SENSITIVE]" && !normalized.includes("your_")
    ? normalized
    : "";
}

function requestTimeout(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_DEEPSEEK_TIMEOUT_MS;
  return Math.max(1_000, Math.min(Math.round(value as number), 60_000));
}

function reportDeepSeekFailure(reason: string, details: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test") return;
  console.warn("[ai-chat] DeepSeek fallback unavailable", { reason, ...details });
}

export async function generateDeepSeekReply({
  apiKey,
  apiUrl = DEFAULT_DEEPSEEK_API_URL,
  systemPrompt,
  context,
  history,
  message,
  maxTokens = 1_200,
  signal,
  timeoutMs,
  fetchImpl = fetch,
}: GenerateDeepSeekReplyArgs): Promise<string | null> {
  const token = configuredSecret(apiKey);
  if (!token) {
    reportDeepSeekFailure("missing_api_key");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout(timeoutMs));
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "system",
            content: context
              ? `网页已检索到的园本资料如下：\n${context.slice(0, 8_000)}`
              : "网页资料库未检索到直接相关内容。",
          },
          ...history.slice(-12),
          { role: "user", content: message },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      reportDeepSeekFailure("upstream_status", { status: response.status });
      return null;
    }

    const data = (await response.json()) as DeepSeekResponse;
    const answer = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) reportDeepSeekFailure("empty_answer");
    return answer || null;
  } catch (error) {
    reportDeepSeekFailure(controller.signal.aborted ? "timeout_or_abort" : "network_error", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
