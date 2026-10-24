import type {RecognitionResultEventLike} from "./voice-session";

/** A recognition event contains a cumulative snapshot, including revised interim words. */
export function createVoiceTranscriptBuffer({onPreview, onFinal}: {
  onPreview: (text: string) => void;
  onFinal: (text: string) => void;
}) {
  let finalText = "", previewText = "", hasInterim = false, closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {if (timer !== undefined) clearTimeout(timer); timer = undefined;};
  function submit(text: string) {
    clearTimer();
    if (closed || !text) return false;
    closed = true;
    onFinal(text);
    return true;
  }
  return {
    update(event: RecognitionResultEventLike) {
      if (closed) return;
      const finals: string[] = [], interim: string[] = [];
      for (let index = 0; index < (event.results?.length ?? 0); index++) {
        const result = event.results?.[index], text = result?.[0]?.transcript?.trim();
        if (text) (result?.isFinal ? finals : interim).push(text);
      }
      const nextFinal = finals.join(""), nextPreview = nextFinal + interim.join("");
      const nextHasInterim = interim.length > 0;
      if (nextFinal === finalText && nextPreview === previewText && nextHasInterim === hasInterim) return;
      clearTimer();
      finalText = nextFinal;
      previewText = nextPreview;
      hasInterim = nextHasInterim;
      onPreview(previewText);
      if (finalText && !hasInterim) timer = setTimeout(() => submit(finalText), 220);
    },
    // Some browsers end a session with only an interim result. Preserve the
    // latest displayed words instead of silently dropping the whole sentence.
    end: () => submit(previewText),
    get pending() {return !closed && Boolean(previewText);},
    cancel() {closed = true; clearTimer();},
  };
}
