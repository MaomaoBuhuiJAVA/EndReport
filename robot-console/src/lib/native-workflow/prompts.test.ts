import { describe, expect, it } from "vitest";
import { taskPrompt } from "./prompts";

describe("native workflow prompts", () => {
  it("guides ordinary chat to answer directly with context and useful next steps", () => {
    const prompt = taskPrompt("chat");
    expect(prompt).toContain("先直接回答用户当前问题");
    expect(prompt).toContain("沿用前文已经确认的条件");
    expect(prompt).toContain("不确定时明确说明");
  });

  it("keeps short queries focused and grounded in retrieved material", () => {
    const prompt = taskPrompt("chat");
    expect(prompt).toContain("关键词或表达不完整时，先用一个简短问题确认");
    expect(prompt).toContain("用户没有要求活动或教案时，不主动添加活动建议或完整方案");
    expect(prompt).toContain("园本资源标题、诗句和链接只能引用本轮检索到的资料");
    expect(prompt).toContain("不用会造成科学误解的魔法、偏好或有意志比喻");
    expect(prompt).toContain("普通知识问题不提资料库或检索过程");
    expect(prompt).toContain("普通磁铁会吸引铁、镍、钴等少数金属");
    expect(prompt).toContain("铝虽然是金属，普通磁铁也吸不住");
  });
});
