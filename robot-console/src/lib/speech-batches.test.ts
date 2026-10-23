import { expect, it, vi } from "vitest";
import { playSpeechBatches, playSpeechClip, splitSpeechBatches } from "./speech-batches";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const firstSentence = "先摸摸杯壁。";
const longReply = firstSentence + "二".repeat(239) + "。" + "三".repeat(239) + "。" + "最后一起说说发现。";

it("keeps the full long document while making the first complete sentence available separately", () => {
  const text = firstSentence + "观察杯壁上的小水滴，记录变化。\n".repeat(450);
  const batches = splitSpeechBatches(text);
  expect(batches[0]).toBe(firstSentence);
  expect(batches.join("")).toBe(text);
  expect(batches.every(batch => batch.length <= 600)).toBe(true);
});

it("splits an unpunctuated passage without losing or separating emoji", () => {
  const text = "😀".repeat(650);
  const batches = splitSpeechBatches(text);
  expect(batches.length).toBeGreaterThan(2);
  expect(batches.join("")).toBe(text);
  expect(batches.every(batch => batch.length <= 600 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(batch))).toBe(true);
});

it("starts the first clip while a later batch is still being synthesized", async () => {
  const laterAudio = deferred<string>();
  const firstPlayback = deferred<boolean>();
  const spoken: string[] = [];
  const done = playSpeechBatches(longReply, {
    prepare: async text => text === firstSentence ? "first-audio" : laterAudio.promise,
    play: async (audio, text) => { spoken.push(text); return audio === "first-audio" ? firstPlayback.promise : true; },
  });
  await vi.waitFor(() => expect(spoken).toEqual([firstSentence]));
  laterAudio.resolve("later-audio");
  firstPlayback.resolve(true);
  expect(await done).toBe(true);
  expect(spoken.join("")).toBe(longReply);
});

it("plays batches in text order even when the next audio is ready before the first", async () => {
  const firstAudio = deferred<string>();
  const spoken: string[] = [];
  const done = playSpeechBatches(longReply, {
    prepare: text => text === firstSentence ? firstAudio.promise : Promise.resolve(text),
    play: async (_audio, text) => { spoken.push(text); return true; },
  });
  await Promise.resolve();
  expect(spoken).toEqual([]);
  firstAudio.resolve("first-audio");
  expect(await done).toBe(true);
  expect(spoken).toEqual([firstSentence, "二".repeat(239) + "。", "三".repeat(239) + "。", "最后一起说说发现。"]);
});

it("prepares only the current and next batch while the first clip is playing", async () => {
  const firstPlayback = deferred<boolean>();
  const prepared: string[] = [], spoken: string[] = [];
  const done = playSpeechBatches(longReply, {
    prepare: async text => { prepared.push(text); return text; },
    play: async (_audio, text) => { spoken.push(text); return text === firstSentence ? firstPlayback.promise : true; },
  });
  await vi.waitFor(() => expect(spoken).toEqual([firstSentence]));
  expect(prepared).toEqual([firstSentence, "二".repeat(239) + "。"]);
  firstPlayback.resolve(true);
  expect(await done).toBe(true);
  expect(prepared.join("")).toBe(longReply);
});

it("stops pending synthesis promptly and discards late audio after cancellation", async () => {
  const controller = new AbortController(), late = deferred<string>();
  const signals: AbortSignal[] = [], spoken: string[] = [];
  const done = playSpeechBatches(longReply, {
    signal: controller.signal,
    prepare: (_text, signal) => { signals.push(signal); return late.promise; },
    play: async (_audio, text) => { spoken.push(text); return true; },
  });
  controller.abort();
  expect(await done).toBe(false);
  expect(signals.every(signal => signal.aborted)).toBe(true);
  late.resolve("stale-audio");
  await Promise.resolve();
  expect(spoken).toEqual([]);
});

it("settles cancellation during playback without starting another clip", async () => {
  const controller = new AbortController(), playback = deferred<boolean>();
  const spoken: string[] = [];
  const done = playSpeechBatches(longReply, {
    signal: controller.signal,
    prepare: async text => text,
    play: async (_audio, text) => { spoken.push(text); return playback.promise; },
  });
  await vi.waitFor(() => expect(spoken).toEqual([firstSentence]));
  controller.abort();
  expect(await done).toBe(false);
  playback.resolve(true);
  await Promise.resolve();
  expect(spoken).toEqual([firstSentence]);
});

it("reports a later synthesis failure instead of skipping it and continuing the document", async () => {
  const spoken: string[] = [], signals: AbortSignal[] = [];
  const done = await playSpeechBatches(longReply, {
    prepare: async (text, signal) => {
      signals.push(signal);
      if (text.startsWith("二")) throw new Error("provider unavailable");
      return text;
    },
    play: async (_audio, text) => { spoken.push(text); return true; },
  });
  expect(done).toBe(false);
  expect(spoken).toEqual([firstSentence]);
  expect(signals.every(signal => signal.aborted)).toBe(true);
});

it("cancels prefetched work when the browser cannot play the current clip", async () => {
  const spoken: string[] = [], signals: AbortSignal[] = [];
  expect(await playSpeechBatches(longReply, {
    prepare: async (text, signal) => { signals.push(signal); return text; },
    play: async (_audio, text) => { spoken.push(text); throw new Error("playback denied"); },
  })).toBe(false);
  expect(spoken).toEqual([firstSentence]);
  expect(signals.every(signal => signal.aborted)).toBe(true);
});

it("keeps a short reply as one request and avoids requests for empty or already stopped narration", async () => {
  const prepared: string[] = [];
  const options = { prepare: async (text: string) => { prepared.push(text); return text; }, play: async () => true };
  expect(await playSpeechBatches("我们一起观察吧！", options)).toBe(true);
  expect(await playSpeechBatches("  ", options)).toBe(false);
  expect(await playSpeechBatches(longReply, { ...options, signal: AbortSignal.abort() })).toBe(false);
  expect(prepared).toEqual(["我们一起观察吧！"]);
});

it("supports narration in browsers without AbortSignal.any", async () => {
  const original = AbortSignal.any;
  Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true, writable: true });
  try {
    const spoken: string[] = [];
    expect(await playSpeechBatches(longReply, {
      signal: new AbortController().signal,
      prepare: async text => text,
      play: async (_audio, text) => { spoken.push(text); return true; },
    })).toBe(true);
    expect(spoken.join("")).toBe(longReply);
  } finally {
    Object.defineProperty(AbortSignal, "any", { value: original, configurable: true, writable: true });
  }
});

function clipAudio(play: () => Promise<void> = async () => {}) {
  return { play, onended: null, onerror: null } as Pick<HTMLAudioElement, "play" | "onended" | "onerror">;
}

it("waits for a clip to end before allowing the next batch to play", async () => {
  const audio = clipAudio();
  let completed = false, started = false;
  const done = playSpeechClip(audio, { signal: new AbortController().signal, onStarted: () => { started = true; } });
  void done.then(() => { completed = true; });
  await vi.waitFor(() => expect(started).toBe(true));
  expect(completed).toBe(false);
  audio.onended?.call(audio as HTMLAudioElement, new Event("ended"));
  expect(await done).toBe(true);
  expect(audio.onended).toBeNull();
  expect(audio.onerror).toBeNull();
});

it("settles an interrupted clip and ignores a late browser play acknowledgement", async () => {
  const controller = new AbortController(), acknowledgement = deferred<void>();
  const audio = clipAudio(() => acknowledgement.promise);
  let starts = 0;
  const done = playSpeechClip(audio, { signal: controller.signal, onStarted: () => { starts += 1; } });
  controller.abort();
  expect(await done).toBe(false);
  acknowledgement.resolve();
  await Promise.resolve();
  expect(starts).toBe(0);
  expect(audio.onended).toBeNull();
  expect(audio.onerror).toBeNull();
});

it("never starts an already canceled clip", async () => {
  let starts = 0;
  const audio = clipAudio(async () => { starts += 1; });
  expect(await playSpeechClip(audio, { signal: AbortSignal.abort() })).toBe(false);
  expect(starts).toBe(0);
});

it("reports browser rejection and media errors instead of hanging on a clip", async () => {
  const rejected = clipAudio(async () => { throw new Error("autoplay denied"); });
  expect(await playSpeechClip(rejected, { signal: new AbortController().signal })).toBe(false);
  const broken = clipAudio();
  const done = playSpeechClip(broken, { signal: new AbortController().signal });
  broken.onerror?.call(broken as HTMLAudioElement, new Event("error"));
  expect(await done).toBe(false);
});
