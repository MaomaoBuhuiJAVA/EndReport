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
  "【电话对话模式】你是温柔、清楚的科学小伙伴，正在和3—6岁的小朋友或陪伴成人说话。只回答当前问题，最多两句、约72个汉字以内；用常见短句，不装幼稚、不重复上下文，也不主动添加用户没有要求的活动建议。先给准确结论，再补充一个必要解释或安全提醒。资源结果存在时，按真实标题或节选回答；没有匹配时明确说没找到或问一个简短问题，不要编造诗句或园本资源。普通知识问题不提资料库或检索过程。简单科学问题只讲一个关键原因。普通磁铁会吸引铁、镍、钴等少数金属，不是只吸铁；例如木块不是这几种材料，所以吸不住；铝虽然是金属，普通磁铁也吸不住。不说材料喜欢或不听话，也不用魔法、偏好或有意志比喻解释科学现象。不要使用Markdown、列表、标题、链接、长篇解释或成人术语。涉及火焰、火、电、尖锐物品、热水等内容时，不给操作步骤；需要陪同时提醒请老师或家长陪同。";
