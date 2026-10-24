import { expect, it } from "vitest";
import { createVoiceSpeechQueue } from "./voice-speech";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}

it("prepares a complete first sentence before the chat response has finished", async () => {
  const prepared: string[] = [], spoken: string[] = [];
  const firstPlayback = deferred<boolean>();
  const queue = createVoiceSpeechQueue({
    prepare: async text => {prepared.push(text);return text;},
    play: async (audio, text) => {spoken.push(audio);return text === "水遇冷会凝结。" ? firstPlayback.promise : true;},
  });
  queue.push("水遇冷会");
  expect(prepared).toEqual([]);
  queue.push("凝结。");
  expect(prepared).toEqual(["水遇冷会凝结。"]);
  const complete = queue.finish("水遇冷会凝结。我们看看杯壁吧！");
  expect(prepared).toEqual(["水遇冷会凝结。", "我们看看杯壁吧！"]);
  firstPlayback.resolve(true);
  expect(await complete).toBe(true);
  expect(spoken).toEqual(["水遇冷会凝结。", "我们看看杯壁吧！"]);
});

it("keeps speech in sentence order even when later audio becomes ready first", async () => {
  const firstAudio = deferred<string>();
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({
    prepare: text => text === "小水滴聚在一起。" ? firstAudio.promise : Promise.resolve(text),
    play: async audio => {spoken.push(audio);return true;},
  });
  queue.push("小水滴聚在一起。");
  const complete = queue.finish("小水滴聚在一起。它们变重就落下来啦！");
  await Promise.resolve();
  expect(spoken).toEqual([]);
  firstAudio.resolve("小水滴聚在一起。");
  expect(await complete).toBe(true);
  expect(spoken).toEqual(["小水滴聚在一起。", "它们变重就落下来啦！"]);
});

it("discards late synthesized audio after hangup and settles without waiting for it", async () => {
  const abort = new AbortController(), audio = deferred<string>();
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({signal: abort.signal,
    prepare: () => audio.promise,
    play: async text => {spoken.push(text);return true;},
  });
  queue.push("我在听呢。");
  abort.abort();
  expect(await queue.finish("我在听呢。")).toBe(false);
  audio.resolve("过期的声音");
  await Promise.resolve();
  expect(spoken).toEqual([]);
});

it("flushes a short unpunctuated final reply once and ignores later deltas", async () => {
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => text, play: async text => {spoken.push(text);return true;}});
  queue.push("**一起");
  expect(await queue.finish("**一起观察吧**")).toBe(true);
  queue.push("多余内容。");
  expect(await queue.finish("重复结果")).toBe(true);
  expect(spoken).toEqual(["一起观察吧"]);
});

it("returns a recoverable failure when synthesis fails", async () => {
  const queue = createVoiceSpeechQueue({prepare: async () => {throw new Error("TTS unavailable");}, play: async () => true});
  queue.push("我们一起试试。");
  expect(await queue.finish("我们一起试试。")).toBe(false);
});

it("prepares later complete sentences while the model is still streaming", async () => {
  const prepared: string[] = [], spoken: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => {prepared.push(text); return text;}, play: async audio => {spoken.push(audio); return true;}});
  queue.push("水蒸气遇冷变成小水珠。");
  queue.push("许多小水珠聚在一起，就会变重。");
  expect(prepared).toEqual(["水蒸气遇冷变成小水珠。", "许多小水珠聚在一起，就会变重。"]);
  expect(await queue.finish("水蒸气遇冷变成小水珠。许多小水珠聚在一起，就会变重。")).toBe(true);
  expect(spoken.join("")).toBe(prepared.join(""));
});

it("starts a natural first clause without waiting for a long sentence to finish", async () => {
  const prepared: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => {prepared.push(text);return text;}, play: async () => true});
  queue.push("杯子外面的水珠，");
  expect(prepared).toEqual(["杯子外面的水珠，"]);
  expect(await queue.finish("杯子外面的水珠，是空气中的水蒸气遇冷变成的。")).toBe(true);
});

it("bounds synthesis to the current clip plus one prefetched clip", async () => {
  const firstPlayback = deferred<boolean>(); const prepared: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => {prepared.push(text);return text;}, play: async text => text === "先看一看。" ? firstPlayback.promise : true});
  queue.push("先看一看。再摸一摸。最后说一说。");
  const done = queue.finish("先看一看。再摸一摸。最后说一说。");
  expect(prepared).toEqual(["先看一看。", "再摸一摸。"]);
  firstPlayback.resolve(true);
  expect(await done).toBe(true);
  expect(prepared).toEqual(["先看一看。", "再摸一摸。", "最后说一说。"]);
});

it("keeps earlier streamed speech when a long final answer hits the voice limit", async () => {
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => text, play: async text => {spoken.push(text);return true;}});
  queue.push("水蒸气遇冷会变成小水珠。");
  queue.push("我们一起看看杯壁上的水珠。");
  const long = "水蒸气遇冷会变成小水珠。我们一起看看杯壁上的水珠。" + "你还发现了什么呢？".repeat(10);
  expect(await queue.finish(long)).toBe(true);
  expect(spoken.join("")).toContain("我们一起看看杯壁上的水珠。");
  expect(Array.from(spoken.join("")).length).toBeLessThanOrEqual(72);
});

it("does not speak unfinished reasoning tags or fenced code", async () => {
  const prepared: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => {prepared.push(text);return text;}, play: async () => true});
  queue.push("<think>这是内部推理。");
  expect(prepared).toEqual([]);
  queue.push("</think>```js\n这段不要读。");
  expect(prepared).toEqual([]);
  expect(await queue.finish("<think>这是内部推理。</think>```js\n这段不要读。\n```一起观察吧。")).toBe(true);
  expect(prepared).toEqual(["一起观察吧。"]);
});

it("does not require AbortSignal.any in older browsers", async () => {
  const original = AbortSignal.any;
  Object.defineProperty(AbortSignal, "any", {value: undefined, configurable: true});
  try {
    const parent = new AbortController();
    const queue = createVoiceSpeechQueue({signal: parent.signal, prepare: async text => text, play: async () => true});
    expect(await queue.finish("我们一起观察吧。")).toBe(true);
  } finally {Object.defineProperty(AbortSignal, "any", {value: original, configurable: true});}
});

it("cancels remaining synthesis after playback fails", async () => {
  let signal: AbortSignal | undefined;
  const queue = createVoiceSpeechQueue({prepare: async (text, current) => {signal = current;return text;}, play: async () => false});
  queue.push("先看一看。再想一想。");
  expect(await queue.finish("先看一看。再想一想。")).toBe(false);
  expect(signal?.aborted).toBe(true);
});

it("reports a changed authoritative reply instead of silently dropping it", async () => {
  const queue = createVoiceSpeechQueue({prepare: async text => text, play: async () => true});
  queue.push("太阳发出光。");
  expect(await queue.finish("月亮反射太阳光。")).toBe(false);
});

it("does not commit the retractable last character at the 72-character limit", async () => {
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => text, play: async text => {spoken.push(text); return true;}});
  const prefix = "看".repeat(31) + "。" + "想".repeat(39) + "。";
  queue.push(prefix);
  queue.push("后面还有不需要读的长篇说明。");
  expect(await queue.finish(prefix + "后面还有不需要读的长篇说明。")).toBe(true);
  expect(spoken.join("")).toBe(Array.from(prefix).slice(0, 71).join("") + "…");
});

it("keeps emoji intact when splitting unpunctuated speech and preserves all short text", async () => {
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => text, play: async text => {spoken.push(text); return true;}});
  const reply = "看".repeat(31) + "🌞" + "一起看看太阳和月亮有什么不同";
  queue.push(reply);
  expect(await queue.finish(reply)).toBe(true);
  expect(spoken.join("")).toBe(reply);
  expect(spoken[0].endsWith("🌞")).toBe(true);
});

it.each([
  ["[可以观察杯壁。]", "(https://example.com)", "可以观察杯壁。"],
  ["\n答案：小水滴聚在一起就变重啦。", "", "小水滴聚在一起就变重啦。"],
])("keeps streamed normalization consistent with the final spoken reply: %s", async (first, rest, final) => {
  const spoken: string[] = [];
  const queue = createVoiceSpeechQueue({prepare: async text => text, play: async text => {spoken.push(text); return true;}});
  queue.push(first);
  queue.push(rest);
  expect(await queue.finish(final)).toBe(true);
  expect(spoken.join("")).toBe(final);
});
