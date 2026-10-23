import {normalizeVoiceCallReply, voiceCallSpeechText} from "./voice-call";

/** Synthesize each stable phrase during generation, with one clip of lookahead. */
export function createVoiceSpeechQueue<Audio>({signal: parentSignal, prepare, play}: {
  signal?: AbortSignal;
  prepare: (text: string, signal: AbortSignal) => Promise<Audio>;
  play: (audio: Audio, text: string, signal: AbortSignal) => Promise<boolean>;
}) {
  const controller = new AbortController(), signal = controller.signal;
  const cancel = () => {controller.abort(); parentSignal?.removeEventListener("abort", cancel);};
  if (parentSignal?.aborted) cancel(); else parentSignal?.addEventListener("abort", cancel, {once: true});
  let raw = "", queued = "", finalized = false, currentIndex = 0, preparationIndex = 0;
  let playback: Promise<boolean> = Promise.resolve(true), completion: Promise<boolean> | undefined;
  type Prepared = {audio: Audio} | undefined;
  const clips: Array<{text: string; ready: Promise<Prepared>; resolve: (value: Prepared) => void}> = [];

  async function cancellable<T>(operation: Promise<T>): Promise<T | undefined> {
    if (signal.aborted) {void operation.catch(() => {}); return undefined;}
    let onAbort!: () => void;
    const cancelled = new Promise<undefined>(resolve => {
      onAbort = () => resolve(undefined);
      signal.addEventListener("abort", onAbort, {once: true});
    });
    try {return await Promise.race([operation, cancelled]);}
    finally {signal.removeEventListener("abort", onAbort);}
  }

  function prepareAhead() {
    while (!signal.aborted && preparationIndex < clips.length && preparationIndex < currentIndex + 2) {
      const clip = clips[preparationIndex++];
      try {void prepare(clip.text, signal).then(audio => clip.resolve({audio}), () => clip.resolve(undefined));}
      catch {clip.resolve(undefined);}
    }
  }

  function enqueue(text: string) {
    if (!text.trim() || signal.aborted) return;
    queued += text;
    let resolve!: (value: Prepared) => void;
    const ready = new Promise<Prepared>(done => {resolve = done;});
    const clip = {text, ready, resolve};
    const index = clips.push(clip) - 1;
    prepareAhead();
    playback = playback.then(async previousOk => {
      if (!previousOk || signal.aborted) return false;
      const prepared = await cancellable(clip.ready);
      if (!prepared || signal.aborted) {cancel(); return false;}
      let played: boolean | undefined;
      try {played = await cancellable(play(prepared.audio, text, signal));}
      catch {played = false;}
      if (played !== true || signal.aborted) {cancel(); return false;}
      currentIndex = index + 1;
      prepareAhead();
      return true;
    });
  }

  function flush(text: string, final: boolean) {
    // The last character may become an ellipsis if a later delta exceeds the cap.
    if (!final && Array.from(text).length === 72) text = Array.from(text).slice(0, 71).join("").trimEnd();
    if (!text.startsWith(queued)) {cancel(); return;}
    let remaining = text.slice(queued.length);
    while (remaining && !signal.aborted) {
      const characters = Array.from(remaining), first = !queued, limit = first ? 32 : 48;
      const sentence = characters.findIndex(character => /[。！？!?；;]/u.test(character)) + 1;
      let length = sentence && sentence <= limit ? sentence : 0;
      if (!length && first) {
        const pause = characters.findIndex((character, index) => index >= 7 && index < limit && /[，,：:]/u.test(character)) + 1;
        if (pause) length = pause;
      }
      // Leave enough trailing text that an incomplete word cannot change a committed prefix.
      if (!length && characters.length >= limit + 8) length = limit;
      if (!length && final) length = Math.min(limit, characters.length);
      if (!length) break;
      const phrase = characters.slice(0, length).join("");
      enqueue(phrase);
      remaining = remaining.slice(phrase.length);
    }
  }

  return {
    push(delta: string) {
      if (finalized || signal.aborted) return;
      raw += delta;
      flush(voiceCallSpeechText(raw), false);
    },
    finish(reply: string) {
      if (!finalized) {
        finalized = true;
        flush(normalizeVoiceCallReply(reply), true);
        completion = playback.then(played => played && !signal.aborted).finally(() => {
          parentSignal?.removeEventListener("abort", cancel);
        });
      }
      return completion ?? Promise.resolve(false);
    },
    cancel,
  };
}
