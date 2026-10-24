import {afterEach, expect, it, vi} from "vitest";
import {createVoiceTranscriptBuffer} from "./voice-transcript";

afterEach(() => vi.useRealTimers());
const result = (text: string, isFinal = true) => ({isFinal, length: 1, 0: {transcript: text}});

it("previews interim speech and submits stable words after a short pause only once", () => {
  vi.useFakeTimers();
  const onPreview = vi.fn(), onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview, onFinal});
  buffer.update({results: [result("为什么", false)]});
  vi.advanceTimersByTime(500);
  expect(onPreview).toHaveBeenLastCalledWith("为什么");
  expect(onFinal).not.toHaveBeenCalled();
  buffer.update({results: [result("为什么会下雨？")]});
  buffer.update({results: [result("为什么会下雨？")]});
  vi.advanceTimersByTime(220);
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("为什么会下雨？");
  buffer.end();
  expect(onFinal).toHaveBeenCalledTimes(1);
});

it("waits for an unfinished continuation instead of sending the first fragment", () => {
  vi.useFakeTimers();
  const onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview: vi.fn(), onFinal});
  buffer.update({results: [result("小水滴"), result("为什么", false)]});
  vi.advanceTimersByTime(1000);
  expect(onFinal).not.toHaveBeenCalled();
  buffer.update({results: [result("小水滴"), result("为什么会掉下来？")]});
  vi.advanceTimersByTime(220);
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("小水滴为什么会掉下来？");
});

it("submits immediately on natural recognition end and cancels pending submission on hangup", () => {
  vi.useFakeTimers();
  const onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview: vi.fn(), onFinal});
  buffer.update({results: [result("水为什么会结冰？")]});
  expect(buffer.end()).toBe(true);
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("水为什么会结冰？");
  const cancelled = createVoiceTranscriptBuffer({onPreview: vi.fn(), onFinal});
  cancelled.update({results: [result("过期的话")]});
  cancelled.cancel();
  cancelled.end();
  vi.runAllTimers();
  expect(onFinal).toHaveBeenCalledTimes(1);
});

it("replaces revised cumulative results instead of duplicating previously heard words", () => {
  vi.useFakeTimers();
  const onPreview = vi.fn(), onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview, onFinal});
  buffer.update({results: [result("为什么", false)]});
  expect(onPreview).toHaveBeenLastCalledWith("为什么");
  buffer.update({resultIndex: 0, results: [result("为什么会"), result("下鱼", false)]});
  expect(onPreview).toHaveBeenLastCalledWith("为什么会下鱼");
  buffer.update({resultIndex: 1, results: [result("为什么会"), result("下雨？")]});
  vi.advanceTimersByTime(220);
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("为什么会下雨？");
});

it("does not postpone a stable final when the browser repeats the same snapshot", () => {
  vi.useFakeTimers();
  const onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview: vi.fn(), onFinal});
  buffer.update({results: [result("太阳为什么发光？")]});
  vi.advanceTimersByTime(150);
  buffer.update({results: [result("太阳为什么发光？")]});
  vi.advanceTimersByTime(70);
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("太阳为什么发光？");
});

it("keeps the latest interim words when the browser ends without a final event", () => {
  const onPreview = vi.fn(), onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview, onFinal});
  buffer.update({results: [result("彩虹", false)]});
  buffer.update({results: [result("彩虹有几种颜色？", false)]});
  expect(onPreview).toHaveBeenLastCalledWith("彩虹有几种颜色？");
  expect(onFinal).not.toHaveBeenCalled();
  expect(buffer.end()).toBe(true);
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("彩虹有几种颜色？");
});

it("preserves a continuation on natural end and never replays it after cancellation", () => {
  vi.useFakeTimers();
  const onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview: vi.fn(), onFinal});
  buffer.update({results: [result("小水滴"), result("为什么会掉下来？", false)]});
  expect(buffer.end()).toBe(true);
  buffer.cancel();
  buffer.update({results: [result("旧事件不应提交")]});
  vi.runAllTimers();
  expect(onFinal).toHaveBeenCalledExactlyOnceWith("小水滴为什么会掉下来？");
});

it("does not submit an interim sentence when recognition is cancelled by a network error", () => {
  vi.useFakeTimers();
  const onFinal = vi.fn();
  const buffer = createVoiceTranscriptBuffer({onPreview: vi.fn(), onFinal});
  buffer.update({results: [result("我想问"), result("为什么", false)]});
  buffer.cancel();
  expect(buffer.end()).toBe(false);
  vi.runAllTimers();
  expect(onFinal).not.toHaveBeenCalled();
});
