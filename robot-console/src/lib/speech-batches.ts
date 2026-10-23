export function splitSpeechBatches(text: string): string[] {
  if (!text.trim()) return [];
  const characters = Array.from(text);
  const batches: string[] = [];
  let offset = 0;
  while (offset < characters.length) {
    const first = batches.length === 0;
    const limit = first ? 100 : 240;
    let length = Math.min(limit, characters.length - offset);
    if (offset + length < characters.length) {
      const candidate = characters.slice(offset, offset + length);
      const sentences = candidate.flatMap((character, index) => /[。！？!?；;\n]/u.test(character) ? [index + 1] : []);
      const sentence = first ? sentences[0] : sentences.at(-1);
      if (sentence && (first || sentence >= limit / 2)) {
        length = sentence;
      } else {
        const pause = candidate.findLastIndex(character => /[，,、：:\s]/u.test(character)) + 1;
        if (pause >= limit / 2) length = pause;
      }
    }
    batches.push(characters.slice(offset, offset + length).join(""));
    offset += length;
  }
  return batches;
}

const CANCELLED = Symbol("speech cancelled");

async function untilCancelled<T>(operation: Promise<T>, signal: AbortSignal): Promise<T | typeof CANCELLED> {
  if (signal.aborted) return CANCELLED;
  let onAbort!: () => void;
  const cancelled = new Promise<typeof CANCELLED>(resolve => {
    onAbort = () => resolve(CANCELLED);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

/** Prepare at most one batch ahead, but always play in document order. */
export async function playSpeechBatches<Audio>(text: string, options: {
  signal?: AbortSignal;
  prepare: (text: string, signal: AbortSignal) => Promise<Audio>;
  play: (audio: Audio, text: string, signal: AbortSignal) => Promise<boolean>;
}): Promise<boolean> {
  const batches = splitSpeechBatches(text);
  if (!batches.length || options.signal?.aborted) return false;
  const controller = new AbortController();
  const signal = controller.signal;
  const onParentAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onParentAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const preparing = new Map<number, Promise<{ audio: Audio } | undefined>>();
  function prepare(index: number) {
    if (index >= batches.length || signal.aborted) return;
    preparing.set(index, (async () => {
      try { return { audio: await options.prepare(batches[index], signal) }; }
      catch { return undefined; }
    })());
  }
  try {
    prepare(0);
    prepare(1);
    for (let index = 0; index < batches.length; index += 1) {
      const preparation = preparing.get(index);
      if (!preparation || signal.aborted) return false;
      const prepared = await untilCancelled(preparation, signal);
      preparing.delete(index);
      if (!prepared || prepared === CANCELLED || signal.aborted) return false;
      const played = await untilCancelled(options.play(prepared.audio, batches[index], signal).catch(() => false), signal);
      if (played !== true || signal.aborted) return false;
      prepare(index + 2);
    }
    return true;
  } catch { return false; }
  finally {
    options.signal?.removeEventListener("abort", onParentAbort);
    controller.abort();
  }
}

/** A resolved play() means playback started; only ended completes the clip. */
export function playSpeechClip(audio: Pick<HTMLAudioElement, "play" | "onended" | "onerror">, options: {
  signal: AbortSignal;
  onStarted?: () => void;
}): Promise<boolean> {
  const { signal } = options;
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = (played: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      audio.onended = null;
      audio.onerror = null;
      resolve(played && !signal.aborted);
    };
    const onAbort = () => finish(false);
    signal.addEventListener("abort", onAbort, { once: true });
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    try {
      void audio.play().then(() => {
        if (!settled && !signal.aborted) options.onStarted?.();
      }).catch(() => finish(false));
    } catch { finish(false); }
  });
}
