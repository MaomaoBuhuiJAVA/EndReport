const VOICE_CALL_MAX_REPLY_CHARS = 72;

/** Short, friendly copy used when a call has no usable model answer. */
export const VOICE_CALL_EMPTY_REPLY = "我在听呢，小朋友，再说一遍吧！";
export const VOICE_CALL_SERVICE_ERROR = "哎呀，连接慢了一点，我们再试一次吧！";

/** The same prefix-stable text is used for streaming speech and the final reply. */
export function voiceCallSpeechText(value: string): string {
  const cleaned = value
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/giu, "")
    .replace(/```[\s\S]*?(?:```|$)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]*(?:\)|$)/gu, "$1")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/\bhttps?(?::\S*)?$/giu, "")
    .replace(/[*_`>#\[\]-]+/gu, "")
    .trimStart()
    // Voice replies are for young listeners: remove formal report labels and
    // soften a few common, adult-facing phrases without changing the science.
    .replace(/^(?:答案|结论|回答|根据资料库|根据园本资料)[：:]\s*/u, "")
    .replace(/实验材料/gu, "要用的东西")
    .replace(/实验步骤/gu, "小步骤")
    .replace(/观察并记录/gu, "看一看、记下来")
    .replace(/注意事项/gu, "小提醒")
    .replace(/科学原理/gu, "为什么会这样")
    .replace(/\s+/gu, " ")
    .trim();
  if (Array.from(cleaned).length <= VOICE_CALL_MAX_REPLY_CHARS) return cleaned;
  // Never retract a later sentence that has already entered the speech queue.
  const clipped = Array.from(cleaned).slice(0, VOICE_CALL_MAX_REPLY_CHARS - 1).join("").trimEnd();
  return `${clipped}…`;
}

export function normalizeVoiceCallReply(value: string): string {
  return voiceCallSpeechText(value) || VOICE_CALL_EMPTY_REPLY;
}

export const VOICE_CALL_PROMPT =
  "【电话对话模式】你正在和3—6岁的小朋友说话，请做一个温柔、活泼的科学小伙伴。只回答当前问题，最多两句、约72个汉字以内；用小朋友听得懂的短句和常用词，语气亲切，可以用“我们一起试试”“你发现了吗”这样的探索邀请，但不要装幼稚或堆叠语气词。先说结论，再给一个最必要的小提醒或安全提示；解释抽象概念时只用一个简单的生活比喻。不要使用Markdown、列表、标题、链接、长篇解释、成人术语或重复上下文。涉及火、电、尖锐物品、热水等内容时，提醒请老师或家长陪同。若问题不清楚，只问一个简短澄清问题。";
