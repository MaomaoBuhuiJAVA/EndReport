import { expect, it } from "vitest";
import { isGeneratedImageUrl } from "./generated-image-url";

it.each([
  "https://dashscope-0484.oss-accelerate.aliyuncs.com/result.png",
  "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/result.png",
])("accepts an observed image service output: %s", value => {
  expect(isGeneratedImageUrl(new URL(value))).toBe(true);
});

it.each([
  "https://dashscope-0484.oss-accelerate.aliyuncs.com.attacker.example/result.png",
  "https://other.oss-accelerate.aliyuncs.com/result.png",
  "http://dashscope-0484.oss-accelerate.aliyuncs.com/result.png",
  "https://username:password@dashscope-0484.oss-accelerate.aliyuncs.com/result.png",
])("rejects a destination outside the result service: %s", value => {
  expect(isGeneratedImageUrl(new URL(value))).toBe(false);
});
