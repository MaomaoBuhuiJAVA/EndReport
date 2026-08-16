import { describe, expect, it, vi } from "vitest";
import {
  beginVoiceSession,
  canApplyVoiceSessionResult,
  canRestartListening,
  extractFinalTranscript,
  stopAudioPlayback,
  transitionCallPhase,
  invalidateVoiceSession,
} from "./voice-session";

describe("voice session lifecycle", () => {
  it("moves a live call from listening to thinking, speaking, and listening again", () => {
    const session = beginVoiceSession(7, new AbortController());
    const thinking = transitionCallPhase(session, "thinking");
    const speaking = transitionCallPhase(thinking, "speaking");

    expect(session).toMatchObject({ id: 8, phase: "listening" });
    expect(thinking.phase).toBe("thinking");
    expect(speaking.phase).toBe("speaking");
    expect(canRestartListening(speaking, 8)).toBe(true);
    expect(transitionCallPhase(speaking, "listening").phase).toBe("listening");
  });

  it("rejects late AI or TTS results from a stale or ended call", () => {
    const controller = new AbortController();
    const session = beginVoiceSession(3, controller);
    const acceptsFetchSignal = (signal: RequestInit["signal"]) => signal;

    expect(canApplyVoiceSessionResult(session, session.id + 1)).toBe(false);
    expect(acceptsFetchSignal(session.abortController.signal)).toBe(controller.signal);

    const ended = invalidateVoiceSession(session, "ended");
    expect(controller.signal.aborted).toBe(true);
    expect(ended.phase).toBe("ended");
    expect(canApplyVoiceSessionResult(ended, ended.id)).toBe(false);
  });

  it("does not restart recognition after the call is muted", () => {
    const controller = new AbortController();
    const muted = invalidateVoiceSession(beginVoiceSession(10, controller), "muted");

    expect(muted.phase).toBe("muted");
    expect(controller.signal.aborted).toBe(true);
    expect(canRestartListening(muted, muted.id)).toBe(false);
    expect(canApplyVoiceSessionResult(muted, muted.id)).toBe(false);
  });

  it("does not move an already-aborted session into a new call phase", () => {
    const controller = new AbortController();
    const session = beginVoiceSession(12, controller);
    controller.abort();

    expect(transitionCallPhase(session, "thinking")).toBe(session);
  });
});

describe("voice session browser boundaries", () => {
  it("extracts only final recognition text from newly reported results", () => {
    const transcript = extractFinalTranscript({
      resultIndex: 1,
      results: {
        0: { isFinal: true, 0: { transcript: "已处理的句子" }, length: 1 },
        1: { isFinal: false, 0: { transcript: "中间结果" }, length: 1 },
        2: { isFinal: true, 0: { transcript: " 现在说完 " }, length: 1 },
        length: 3,
      },
    });

    expect(transcript).toBe("现在说完");
  });

  it("stops and releases previous audio before a new playback replaces it", () => {
    const pause = vi.fn();
    const removeAttribute = vi.fn();
    const load = vi.fn();
    const revokeObjectURL = vi.fn();
    const previousAudio = {
      pause,
      removeAttribute,
      load,
      src: "blob:old-response",
      onended: vi.fn(),
      onerror: vi.fn(),
    };

    expect(
      stopAudioPlayback(
        { audio: previousAudio, objectUrl: "blob:old-response" },
        { revokeObjectURL },
      ),
    ).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(removeAttribute).toHaveBeenCalledWith("src");
    expect(previousAudio.src).toBe("");
    expect(previousAudio.onended).toBeNull();
    expect(previousAudio.onerror).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-response");
  });
});
