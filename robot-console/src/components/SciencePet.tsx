"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Mic, Send, X } from "lucide-react";
import { GardenSeal } from "@/components/GardenSeal";
import Markdown from "react-markdown";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type PetPhoto = {
  id: string;
  title: string;
  url: string;
  description?: string | null;
};

type PetMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  photos?: PetPhoto[];
};

type PetPosition = {
  right: number;
  bottom: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startRight: number;
  startBottom: number;
  moved: boolean;
};

type VoiceStatus = "idle" | "starting" | "listening" | "processing" | "error" | "unsupported";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string; confidence: number };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionErrorEventLike = Event & { error: string };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type PetAnimationState =
  | "idle"
  | "running-left"
  | "running-right"
  | "waiting"
  | "moving"
  | "working";

type WalkDirection = "left" | "right";

const starters = ["推荐一个亲子实验", "找一首小班科学诗"];
const petWidth = 116;
const petHeight = 122;
const viewportMargin = 6;
const patrolDuration = 2200;
const petAnimations: Record<
  PetAnimationState,
  { row: number; durations: readonly number[] }
> = {
  idle: { row: 0, durations: [1680, 660, 660, 840, 840, 1920] },
  "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  moving: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  working: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function SciencePet() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [spriteFrame, setSpriteFrame] = useState(0);
  const [autoWalk, setAutoWalk] = useState<WalkDirection | null>(null);
  const [position, setPosition] = useState<PetPosition>({ right: 18, bottom: 10 });
  const [dock, setDock] = useState({ left: false, top: false });
  const [messages, setMessages] = useState<PetMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "你好，我是科小贝。想找科学诗、实验教案、亲子玩法或园所资料，都可以问我。",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(2);
  const dragRef = useRef<DragState | null>(null);
  const petRootRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  const suppressClickRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voicePressedRef = useRef(false);
  const voiceBaseInputRef = useRef("");
  const voiceTranscriptRef = useRef("");

  const animationState: PetAnimationState = busy
    ? "working"
    : dragging
      ? "moving"
      : autoWalk
        ? `running-${autoWalk}`
        : open
          ? "waiting"
          : "idle";
  const animation = petAnimations[animationState];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let currentFrame = 0;
    let timer = 0;
    const scheduleNextFrame = () => {
      timer = window.setTimeout(() => {
        currentFrame = (currentFrame + 1) % animation.durations.length;
        setSpriteFrame(currentFrame);
        scheduleNextFrame();
      }, animation.durations[currentFrame]);
    };

    scheduleNextFrame();
    return () => window.clearTimeout(timer);
  }, [animation]);

  useEffect(() => {
    if (
      open ||
      busy ||
      dragging ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let startTimer = 0;
    let stopTimer = 0;
    let movementFrame = 0;

    const schedulePatrol = () => {
      startTimer = window.setTimeout(() => {
        const current = positionRef.current;
        const maxRight = window.innerWidth - petWidth - viewportMargin;
        const availableWidth = Math.max(0, maxRight - viewportMargin);
        if (availableWidth < 40) {
          schedulePatrol();
          return;
        }

        const direction: WalkDirection =
          current.right >= maxRight - 36
            ? "right"
            : current.right <= viewportMargin + 36
              ? "left"
              : current.right < maxRight / 2
                ? "left"
                : "right";
        const distance = Math.min(window.innerWidth < 640 ? 84 : 148, availableWidth);
        const next = {
          right: clamp(
            current.right + (direction === "left" ? distance : -distance),
            viewportMargin,
            maxRight,
          ),
          bottom: current.bottom,
        };

        setAutoWalk(direction);
        movementFrame = window.requestAnimationFrame(() => {
          positionRef.current = next;
          setPosition(next);
        });

        stopTimer = window.setTimeout(() => {
          setAutoWalk(null);
          schedulePatrol();
        }, patrolDuration);
      }, 4800);
    };

    schedulePatrol();
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(stopTimer);
      window.cancelAnimationFrame(movementFrame);
    };
  }, [busy, dragging, open]);

  useEffect(
    () => () => {
      voicePressedRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, open]);

  useEffect(() => {
    function keepInViewport() {
      const current = positionRef.current;
      const right = clamp(
        current.right,
        viewportMargin,
        window.innerWidth - petWidth - viewportMargin,
      );
      const bottom = clamp(
        current.bottom,
        viewportMargin,
        window.innerHeight - petHeight - viewportMargin,
      );
      const next = { right, bottom };
      const centerX = window.innerWidth - right - petWidth / 2;
      const centerY = window.innerHeight - bottom - petHeight / 2;

      positionRef.current = next;
      setPosition(next);
      setDock({
        left: centerX < window.innerWidth / 2,
        top: centerY < window.innerHeight / 2,
      });
    }

    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, []);

  async function sendMessage(prompt: string) {
    const content = prompt.trim();
    if (!content || busy) return;

    const userMessageId = messageIdRef.current++;
    const assistantMessageId = messageIdRef.current++;
    const history = messages.slice(-6).map((message) => ({
      role: message.role,
      content: message.text,
    }));

    setMessages((current) => [...current, { id: userMessageId, role: "user", text: content }]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history }),
      });
      if (!response.ok) throw new Error("Assistant request failed");

      const data = (await response.json()) as {
        reply?: string;
        photos?: PetPhoto[];
      };
      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: "assistant",
          text: data.reply?.trim() || "资料库暂时没有返回内容，请换个问法试试。",
          photos: data.photos,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: "assistant",
          text: "我现在没有连上知识服务，请稍后再问一次。",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function startVoiceInput(event: ReactPointerEvent<HTMLButtonElement>) {
    if (busy || voiceStatus === "starting" || voiceStatus === "listening") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const voiceWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("unsupported");
      setVoiceNotice("当前浏览器不支持语音识别，请使用系统键盘的麦克风。");
      return;
    }

    const recognition = new Recognition();
    let failed = false;
    voicePressedRef.current = true;
    voiceBaseInputRef.current = input.trim();
    voiceTranscriptRef.current = "";
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!voicePressedRef.current) {
        recognition.stop();
        return;
      }
      setVoiceStatus("listening");
      setVoiceNotice("正在聆听，松开后完成输入");
    };
    recognition.onresult = (resultEvent) => {
      let transcript = "";
      for (let index = 0; index < resultEvent.results.length; index += 1) {
        transcript += resultEvent.results[index]?.[0]?.transcript ?? "";
      }
      const spokenText = transcript.trim();
      voiceTranscriptRef.current = spokenText;
      if (spokenText) {
        const base = voiceBaseInputRef.current;
        setInput(`${base}${base ? " " : ""}${spokenText}`);
      }
    };
    recognition.onerror = (errorEvent) => {
      if (errorEvent.error === "aborted" && !voicePressedRef.current) return;
      failed = true;
      const errorMessages: Record<string, string> = {
        "not-allowed": "麦克风权限未开启，请在浏览器设置中允许访问。",
        "service-not-allowed": "浏览器已禁用语音识别服务。",
        "audio-capture": "没有检测到可用的麦克风。",
        "no-speech": "没有听到声音，请按住后再说一次。",
        network: "语音服务暂时无法连接，请稍后重试。",
      };
      setVoiceStatus("error");
      setVoiceNotice(errorMessages[errorEvent.error] ?? "语音识别失败，请重新尝试。");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      voicePressedRef.current = false;
      if (failed) return;
      setVoiceStatus("idle");
      setVoiceNotice(
        voiceTranscriptRef.current ? "语音已转成文字，可以继续编辑或发送。" : "没有听清，请按住麦克风再试一次。",
      );
    };

    setVoiceStatus("starting");
    setVoiceNotice("正在启动麦克风...");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      voicePressedRef.current = false;
      setVoiceStatus("error");
      setVoiceNotice("麦克风启动失败，请重新按住尝试。");
    }
  }

  function stopVoiceInput(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    voicePressedRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setVoiceStatus("processing");
    setVoiceNotice("正在整理语音...");
    try {
      recognition.stop();
    } catch {
      recognition.abort();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    if (autoWalk && petRootRef.current) {
      const bounds = petRootRef.current.getBoundingClientRect();
      const current = {
        right: window.innerWidth - bounds.right,
        bottom: window.innerHeight - bounds.bottom,
      };
      positionRef.current = current;
      setPosition(current);
      setAutoWalk(null);
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: positionRef.current.right,
      startBottom: positionRef.current.bottom,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;

    drag.moved = true;
    setDragging(true);

    const right = clamp(
      drag.startRight - deltaX,
      viewportMargin,
      window.innerWidth - petWidth - viewportMargin,
    );
    const bottom = clamp(
      drag.startBottom - deltaY,
      viewportMargin,
      window.innerHeight - petHeight - viewportMargin,
    );
    const centerX = window.innerWidth - right - petWidth / 2;
    const centerY = window.innerHeight - bottom - petHeight / 2;

    positionRef.current = { right, bottom };
    setPosition(positionRef.current);
    setDock({
      left: centerX < window.innerWidth / 2,
      top: centerY < window.innerHeight / 2,
    });
  }

  function finishPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    setDragging(false);
  }

  function handlePetClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  }

  const visibleFrame = spriteFrame % animation.durations.length;
  const spriteStyle = {
    "--pet-x": `${(visibleFrame / 7) * 100}%`,
    "--pet-y": `${(animation.row / 10) * 100}%`,
  } as CSSProperties;

  return (
    <div
      ref={petRootRef}
      className={[
        "science-pet",
        open ? "is-open" : "",
        autoWalk ? "is-auto-walking" : "",
        dock.left ? "is-left" : "",
        dock.top ? "is-top" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ right: position.right, bottom: position.bottom }}
    >
      <AnimatePresence>
        {open ? (
          <motion.section
            className="pet-chat"
            aria-label="科小贝智能助手"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <header className="pet-chat__header">
              <span>
                <GardenSeal glyph="贝" size="mini" tone="gold" />
                科小贝
              </span>
              <button type="button" onClick={() => setOpen(false)} title="关闭对话">
                <X size={17} />
              </button>
            </header>

            <div ref={scrollRef} className="pet-chat__messages" aria-live="polite">
              {messages.slice(-8).map((message) => (
                <div
                  key={message.id}
                  className={`pet-message pet-message--${message.role}`}
                >
                  {message.role === "assistant" ? (
                    <Markdown>{message.text}</Markdown>
                  ) : (
                    message.text
                  )}
                  {message.photos?.length ? (
                    <div className="pet-message__photos">
                      {message.photos.slice(0, 4).map((photo) => (
                        <a href={photo.url} key={photo.id} target="_blank" rel="noreferrer">
                          <span className="pet-message__photo">
                            <Image alt={photo.title} fill sizes="132px" src={photo.url} />
                          </span>
                          <span>{photo.title}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {busy ? (
                <div className="pet-message pet-message--assistant">
                  <span className="typing-dots" aria-label="科小贝正在检索">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              ) : null}
            </div>

            {messages.length === 1 ? (
              <div className="pet-chat__starters">
                {starters.map((starter) => (
                  <button key={starter} type="button" onClick={() => void sendMessage(starter)}>
                    {starter}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="pet-chat__composer">
              {voiceNotice ? (
                <p className="pet-chat__voice-feedback" role="status">
                  {voiceNotice}
                </p>
              ) : null}
              <form className="pet-chat__form" onSubmit={handleSubmit}>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={voiceStatus === "listening" ? "正在聆听..." : "问问科小贝..."}
                  aria-label="向科小贝提问"
                  disabled={busy}
                />
                <button
                  type="button"
                  className={`pet-chat__voice${voiceStatus === "listening" || voiceStatus === "starting" ? " is-listening" : ""}`}
                  disabled={busy || voiceStatus === "processing"}
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerCancel={stopVoiceInput}
                  onPointerDown={startVoiceInput}
                  onPointerUp={stopVoiceInput}
                  aria-label="按住进行语音输入"
                  aria-pressed={voiceStatus === "listening"}
                  title="按住说话，松开完成"
                >
                  <Mic size={17} />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || busy || voiceStatus === "listening" || voiceStatus === "starting" || voiceStatus === "processing"}
                  title="发送"
                >
                  <Send size={17} />
                </button>
              </form>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        className={`science-pet__button${dragging ? " is-dragging" : ""}`}
        onClick={handlePetClick}
        onPointerCancel={finishPointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        aria-label={open ? "收起科小贝，可拖动" : "问问科小贝，可拖动"}
        title="拖动小树芽，点击问科小贝"
      >
        <span
          className="science-pet__sprite"
          role="img"
          aria-label="Seedy 小树芽科小贝"
          data-pet-state={animationState}
          style={spriteStyle}
        />
      </button>
    </div>
  );
}
