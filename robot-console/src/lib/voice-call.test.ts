import { describe, expect, it } from "vitest";
import {
  normalizeVoiceCallReply,
  VOICE_CALL_EMPTY_REPLY,
  VOICE_CALL_PROMPT,
  VOICE_CALL_SERVICE_ERROR,
} from "./voice-call";

describe("voice call replies", () => {
  it("keeps a normal short reply unchanged", () => {
    expect(normalizeVoiceCallReply("可以试试影子剧场。把手电筒和小玩偶准备好。"))
      .toBe("可以试试影子剧场。把手电筒和小玩偶准备好。");
  });

  it("removes markdown and clips long model output", () => {
    const reply = normalizeVoiceCallReply("## 活动建议\n可以做一个光影实验。" + "请观察并记录变化。".repeat(20));
    expect(reply).not.toContain("##");
    expect(Array.from(reply).length).toBeLessThanOrEqual(72);
    expect(reply).toMatch(/[。！？!?…]$/u);
  });

  it("uses child-friendly wording for common formal phrases", () => {
    expect(normalizeVoiceCallReply("答案：请准备实验材料，按照实验步骤观察并记录科学原理。"))
      .toBe("请准备要用的东西，按照小步骤看一看、记下来为什么会这样。");
  });

  it("provides a playful fallback when the model returns no spoken text", () => {
    expect(normalizeVoiceCallReply("   ")).toBe(VOICE_CALL_EMPTY_REPLY);
    expect(VOICE_CALL_EMPTY_REPLY).toContain("小朋友");
    expect(VOICE_CALL_SERVICE_ERROR).toContain("再试一次");
  });

  it("requires a concise spoken answer", () => {
    expect(VOICE_CALL_PROMPT).toContain("最多两句");
    expect(VOICE_CALL_PROMPT).toContain("不要使用Markdown");
    expect(VOICE_CALL_PROMPT).toContain("3—6岁");
    expect(VOICE_CALL_PROMPT).toContain("科学小伙伴");
    expect(VOICE_CALL_PROMPT).toContain("请老师或家长陪同");
  });
});
