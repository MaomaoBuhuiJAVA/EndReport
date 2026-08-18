import { describe, expect, it } from "vitest";
import { assistantDisplayText } from "./assistant-display-text";

describe("assistantDisplayText", () => {
  it("removes the structured result fence while keeping the readable reply", () => {
    const text = [
      "我先整理图片中能直接看到的内容。",
      "```agent-result",
      '{"kind":"vision_observation","facts":["桌面上有透明杯"]}',
      "```",
    ].join("\n");

    expect(assistantDisplayText(text, "vision_observation")).toBe("我先整理图片中能直接看到的内容。");
  });

  it("keeps ordinary code fences and removes a duplicate cover image", () => {
    const text = [
      "封面已生成。",
      "```text",
      "不要隐藏这段普通代码围栏",
      "```",
      "![封面](https://upload.dify.ai/files/cover.png)",
    ].join("\n");

    expect(assistantDisplayText(text, "poetry_cover")).toBe([
      "封面已生成。",
      "```text",
      "不要隐藏这段普通代码围栏",
      "```",
    ].join("\n"));
  });
});
