import { describe, expect, it } from "vitest";
import { taskPrompt } from "./prompts";

describe("native workflow prompts", () => {
  it("guides ordinary chat to answer directly with context and useful next steps", () => {
    const prompt = taskPrompt("chat");
    expect(prompt).toContain("先直接回答用户当前问题");
    expect(prompt).toContain("沿用前文已经确认的条件");
    expect(prompt).toContain("不确定时明确说明");
  });
});
