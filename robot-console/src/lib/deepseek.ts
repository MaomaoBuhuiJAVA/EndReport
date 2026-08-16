import type { ConversationMessage } from "@/lib/types";

type GenerateDeepSeekReplyArgs = {
  apiKey?: string;
  apiUrl: string;
  systemPrompt: string;
  context: string;
  history: ConversationMessage[];
  message: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function generateDeepSeekReply({
  apiKey,
  apiUrl,
  systemPrompt,
  context,
  history,
  message,
  maxTokens = 900,
  fetchImpl = fetch,
}: GenerateDeepSeekReplyArgs) {
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "system",
            content: context
              ? `资料库检索内容如下：\n${context.slice(0, 8000)}`
              : "资料库检索内容：未找到直接相关资料。",
          },
          ...history.slice(-12),
          { role: "user", content: message },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as DeepSeekResponse;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
