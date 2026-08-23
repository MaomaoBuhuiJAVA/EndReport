import { describe, expect, it } from "vitest";
import { normalizeVoiceCallReply, VOICE_CALL_PROMPT } from "./voice-call";

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

  it("requires a concise spoken answer", () => {
    expect(VOICE_CALL_PROMPT).toContain("最多两句");
    expect(VOICE_CALL_PROMPT).toContain("不要使用Markdown");
  });
});

