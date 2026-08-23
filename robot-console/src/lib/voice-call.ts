const VOICE_CALL_MAX_REPLY_CHARS = 72;

/**
 * Keeps voice-call replies short and speakable without changing normal chat
 * output. Dify can still return markdown or a long explanation, but a call
 * should answer the current turn in one or two natural sentences.
 */
export function normalizeVoiceCallReply(value: string): string {
  const cleaned = value
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .replace(/```[\s\S]*?```/gu, "")
    .replace(/[*_`>#-]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!cleaned) return "我在听，请再说一次。";
  if (cleaned.length <= VOICE_CALL_MAX_REPLY_CHARS) return cleaned;

  const firstSentences = cleaned.match(/^.{8,72}?[。！？!?]/u)?.[0]?.trim();
  if (firstSentences && firstSentences.length <= VOICE_CALL_MAX_REPLY_CHARS) return firstSentences;

  const clipped = Array.from(cleaned).slice(0, VOICE_CALL_MAX_REPLY_CHARS - 1).join("").trimEnd();
  return `${clipped}…`;
}

export const VOICE_CALL_PROMPT =
  "【电话对话模式】请像幼儿园老师身边的语音助手一样回答：只回答当前问题，最多两句、约72个汉字以内；先给结论，再给一个最必要的提示。不要使用Markdown、列表、标题、链接、长篇解释或重复上下文。若问题不清楚，只问一个简短澄清问题。";
