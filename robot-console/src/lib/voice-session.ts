export type CallPhase = "listening" | "thinking" | "speaking" | "muted" | "ended";

type InactiveCallPhase = Extract<CallPhase, "muted" | "ended">;

export type AbortSignalLike = AbortSignal;

export type AbortControllerLike = {
  readonly signal: AbortSignalLike;
  abort: () => void;
};

export type VoiceSession = {
  readonly id: number;
  readonly phase: CallPhase;
  readonly abortController: AbortControllerLike;
};

export type RecognitionAlternativeLike = {
  transcript?: string | null;
};

export type RecognitionResultLike = {
  readonly isFinal?: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternativeLike | undefined;
};

export type RecognitionResultsLike = {
  readonly length: number;
  readonly [index: number]: RecognitionResultLike | undefined;
};

export type RecognitionResultEventLike = {
  readonly resultIndex?: number;
  readonly results?: RecognitionResultsLike | null;
};

export type AudioLike = {
  pause?: () => unknown;
  removeAttribute?: (name: string) => void;
  load?: () => void;
  src?: string;
  onended?: ((event: Event) => unknown) | null;
  onerror?: ((event: Event) => unknown) | null;
};

export type VoiceAudioPlayback = {
  readonly audio?: AudioLike | null;
  readonly objectUrl?: string | null;
};

export type ObjectUrlApiLike = {
  revokeObjectURL?: (url: string) => void;
};

const phaseTransitions: Record<CallPhase, readonly CallPhase[]> = {
  listening: ["thinking"],
  thinking: ["speaking"],
  speaking: ["listening"],
  muted: [],
  ended: [],
};

export function beginVoiceSession(
  previousSessionId: number,
  abortController: AbortControllerLike = new AbortController(),
): VoiceSession {
  return {
    id: previousSessionId + 1,
    phase: "listening",
    abortController,
  };
}

export function transitionCallPhase(session: VoiceSession, nextPhase: CallPhase): VoiceSession {
  if (session.abortController.signal.aborted) return session;
  if (!phaseTransitions[session.phase].includes(nextPhase)) return session;

  return { ...session, phase: nextPhase };
}

export function invalidateVoiceSession(
  session: VoiceSession,
  phase: InactiveCallPhase,
): VoiceSession {
  if (!session.abortController.signal.aborted) session.abortController.abort();
  return { ...session, phase };
}

export function canApplyVoiceSessionResult(session: VoiceSession, currentSessionId: number): boolean {
  return (
    session.id === currentSessionId &&
    !session.abortController.signal.aborted &&
    session.phase !== "muted" &&
    session.phase !== "ended"
  );
}

export function canRestartListening(session: VoiceSession, currentSessionId: number): boolean {
  return canApplyVoiceSessionResult(session, currentSessionId) && session.phase === "speaking";
}

export function extractFinalTranscript(event: RecognitionResultEventLike): string {
  const results = event.results;
  if (!results) return "";

  const resultIndex = Number.isInteger(event.resultIndex) ? Math.max(0, event.resultIndex ?? 0) : 0;
  const transcript: string[] = [];

  for (let index = resultIndex; index < results.length; index += 1) {
    const result = results[index];
    if (!result?.isFinal) continue;

    const text = result[0]?.transcript?.trim();
    if (text) transcript.push(text);
  }

  return transcript.join("");
}

export function stopAudioPlayback(
  playback: VoiceAudioPlayback | null | undefined,
  objectUrlApi?: ObjectUrlApiLike,
): null {
  const audio = playback?.audio;

  try {
    audio?.pause?.();
  } catch {
    // Cleanup must continue even when a browser rejects an already-ended audio element.
  }

  try {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.src = "";
      audio.removeAttribute?.("src");
      audio.load?.();
    }
  } catch {
    // Object URL release below is still required if the element cleanup fails.
  }

  try {
    if (playback?.objectUrl) objectUrlApi?.revokeObjectURL?.(playback.objectUrl);
  } catch {
    // URL cleanup is best effort because it should never block ending a call.
  }

  return null;
}
