"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  Camera,
  Check,
  Copy,
  ChevronUp,
  FileText,
  Keyboard,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  ClipboardList,
  Send,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { GardenSeal } from "@/components/GardenSeal";
import { AgentResultCard } from "@/components/AgentResultCard";
import {
  readAiChatResponse,
  type AiChatAttachmentStatus,
  type AiChatStreamEvent,
} from "@/lib/ai-chat-stream";
import type { AgentResult } from "@/lib/agent-result";
import { assistantDisplayText } from "@/lib/assistant-display-text";
import { createDifyWebUserId } from "@/lib/dify-session";
import type { ScienceLabLink } from "@/lib/science-lab-links";
import {
  beginVoiceSession,
  canApplyVoiceSessionResult,
  canRestartListening,
  extractFinalTranscript,
  invalidateVoiceSession,
  stopAudioPlayback,
  transitionCallPhase,
  type VoiceSession,
} from "@/lib/voice-session";
import Markdown from "react-markdown";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
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
  labLinks?: ScienceLabLink[];
  attachment?: AiChatAttachmentStatus;
  agentResult?: AgentResult;
};

type PetPosition = {
  right: number;
  bottom: number;
};

type PetChatSize = {
  width: number;
  height: number;
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
type ComposerMode = "text" | "voice";
type CallPhase = "idle" | "preparing" | "listening" | "thinking" | "speaking" | "muted" | "error";

type AssistantReply = {
  text: string;
  photos?: PetPhoto[];
  labLinks?: ScienceLabLink[];
  attachment?: AiChatAttachmentStatus;
  agentResult?: AgentResult;
};

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
type KexiaobeiWindow = typeof window & { __kexiaobeiOpenRequested?: boolean };

type PetAnimationState =
  | "idle"
  | "running-left"
  | "running-right"
  | "waiting"
  | "moving"
  | "working";

type WalkDirection = "left" | "right";

const starters = [
  "推荐一个小班科学实验",
  "找一首小班科学诗",
  "生成《玩转纸片》完整教案",
];

const creationActions = [
  { type: "upload", label: "上传文件" },
  { type: "photo", label: "拍照提问" },
  { type: "plan", label: "完整教案" },
  { type: "document", label: "课件 / 文档" },
  { type: "analysis", label: "教案 / 研修分析" },
] as const;

type CreationAction = (typeof creationActions)[number]["type"];
type CreationDialogKind = Exclude<CreationAction, "upload" | "photo">;
type CreationFormState = {
  ageGroup: string;
  topic: string;
  duration: string;
  purpose: string;
  format: string;
};

const emptyCreationForm: CreationFormState = {
  ageGroup: "",
  topic: "",
  duration: "",
  purpose: "",
  format: "Word 文档",
};

const creationDialogTitles: Record<CreationDialogKind, string> = {
  plan: "生成完整教案",
  document: "生成课件 / 文档",
  analysis: "教案 / 研修分析",
};

const creationAgeGroups = ["托班", "小班", "中班", "大班"];
const creationDurations = ["15 分钟", "20 分钟", "30 分钟", "40 分钟"];
const creationFormats = ["Word 文档", "PDF 文档", "课件提纲"];

const petWidth = 116;
const petHeight = 122;
const viewportMargin = 6;
const mobilePetBottom = 82;
const mobileNavigationGap = 12;
const chatGap = 14;
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

const thinkingGhostPieces = [
  "top0",
  "top1",
  "top2",
  "top3",
  "top4",
  "st0",
  "st1",
  "st2",
  "st3",
  "st4",
  "st5",
  "an1",
  "an2",
  "an3",
  "an4",
  "an5",
  "an6",
  "an7",
  "an8",
  "an9",
  "an10",
  "an11",
  "an12",
  "an13",
  "an14",
  "an15",
  "an16",
  "an17",
  "an18",
] as const;

function ThinkingGhost() {
  return (
    <span className="thinking-ghost" role="img" aria-label="科小贝正在思考">
      <span className="thinking-ghost__scene" aria-hidden="true">
        <span className="thinking-ghost__body">
          <span className="thinking-ghost__eye thinking-ghost__eye--left" />
          <span className="thinking-ghost__eye thinking-ghost__eye--right" />
          <span className="thinking-ghost__pupil thinking-ghost__pupil--left" />
          <span className="thinking-ghost__pupil thinking-ghost__pupil--right" />
          {thinkingGhostPieces.map((piece) => (
            <span key={piece} className="thinking-ghost__piece" data-piece={piece} />
          ))}
        </span>
        <span className="thinking-ghost__shadow" />
      </span>
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getPetBottomBounds() {
  const navigation = window.innerWidth <= 1023
    ? document.querySelector<HTMLElement>(".home-bottom-nav")
    : null;
  const navigationHeight = navigation?.getBoundingClientRect().height ?? 0;
  const navigationInset = navigationHeight > 0
    ? navigationHeight + mobileNavigationGap
    : viewportMargin;
  const minBottom = Math.max(viewportMargin, navigationInset);
  const maxBottom = Math.max(minBottom, window.innerHeight - petHeight - viewportMargin);

  return { minBottom, maxBottom };
}

function getSpeechRecognitionConstructor() {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
}

function toSpeechText(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/[`#>*_]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function SciencePet() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("text");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [creationDialog, setCreationDialog] = useState<CreationDialogKind | null>(null);
  const [creationForm, setCreationForm] = useState<CreationFormState>(emptyCreationForm);
  const [creationDialogError, setCreationDialogError] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callNotice, setCallNotice] = useState("");
  const [callTranscript, setCallTranscript] = useState("");
  const [callReply, setCallReply] = useState("");
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [spriteFrame, setSpriteFrame] = useState(0);
  const [autoWalk, setAutoWalk] = useState<WalkDirection | null>(null);
  const [position, setPosition] = useState<PetPosition>({ right: 18, bottom: 10 });
  const [positionReady, setPositionReady] = useState(false);
  const [dock, setDock] = useState({ left: false, top: false });
  const [chatSize, setChatSize] = useState<PetChatSize>({ width: 360, height: 640 });
  const [difyUserId] = useState(createDifyWebUserId);
  const [messages, setMessages] = useState<PetMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "你好，我是科小贝。想找科学诗、科学故事、实验教案或园所资料，都可以问我。",
    },
  ]);
  const messagesRef = useRef<PetMessage[]>(messages);
  const difyConversationIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachmentPreviewUrlRef = useRef<string | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(2);
  const dragRef = useRef<DragState | null>(null);
  const petRootRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  const suppressClickRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voicePressedRef = useRef(false);
  const voiceBaseInputRef = useRef("");
  const voiceTranscriptRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const callRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callSessionRef = useRef<VoiceSession | null>(null);
  const callSessionIdRef = useRef(0);
  const callActiveRef = useRef(false);
  const callMutedRef = useRef(false);
  const speakerEnabledRef = useRef(true);
  const callFinalTimerRef = useRef<number | null>(null);
  const callFinalTranscriptRef = useRef("");
  const callRestartTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.innerWidth <= 1023) {
        const mobilePosition = {
          right: 8,
          bottom: Math.max(mobilePetBottom, getPetBottomBounds().minBottom),
        };
        positionRef.current = mobilePosition;
        setPosition(mobilePosition);
      }
      setPositionReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => () => {
    if (attachmentPreviewUrlRef.current) URL.revokeObjectURL(attachmentPreviewUrlRef.current);
  }, []);

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
        const { minBottom, maxBottom } = getPetBottomBounds();
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
          bottom: clamp(current.bottom, minBottom, maxBottom),
        };

        setAutoWalk(direction);
        movementFrame = window.requestAnimationFrame(() => {
          positionRef.current = next;
          setPosition(next);
          const centerX = window.innerWidth - next.right - petWidth / 2;
          const centerY = window.innerHeight - next.bottom - petHeight / 2;
          setDock({
            left: centerX < window.innerWidth / 2,
            top: centerY < window.innerHeight / 2,
          });
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

  useLayoutEffect(() => {
    const assistantWindow = window as KexiaobeiWindow;
    function openChat(event?: Event) {
      assistantWindow.__kexiaobeiOpenRequested = false;
      const prompt = (event as CustomEvent<{ prompt?: string }> | undefined)?.detail?.prompt?.trim();
      if (prompt) setInput(prompt);
      setOpen(true);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }

    window.addEventListener("kexiaobei:open", openChat);
    if (assistantWindow.__kexiaobeiOpenRequested) openChat();

    return () => window.removeEventListener("kexiaobei:open", openChat);
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;

    function closeMoreMenu(event: PointerEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeMoreMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMoreMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreMenuOpen]);

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
      const { minBottom, maxBottom } = getPetBottomBounds();
      const right = clamp(
        current.right,
        viewportMargin,
        window.innerWidth - petWidth - viewportMargin,
      );
      const bottom = clamp(
        current.bottom,
        minBottom,
        maxBottom,
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

    keepInViewport();
    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, []);

  const clearCallTimers = useCallback(() => {
    callFinalTranscriptRef.current = "";
    if (callFinalTimerRef.current) {
      window.clearTimeout(callFinalTimerRef.current);
      callFinalTimerRef.current = null;
    }
    if (callRestartTimerRef.current) {
      window.clearTimeout(callRestartTimerRef.current);
      callRestartTimerRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      const bounds = petRootRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const isMobile = window.innerWidth <= 720;
      const preferredWidth = Math.max(160, Math.min(360, window.innerWidth - (isMobile ? 24 : 20)));
      const preferredHeight = Math.max(160, Math.min(isMobile ? 680 : 640, window.innerHeight - (isMobile ? 84 : 154)));
      if (isMobile) {
        setDock({ left: false, top: false });
        setChatSize({ width: preferredWidth, height: preferredHeight });
        return;
      }
      const leftSpace = Math.max(0, bounds.left - chatGap - viewportMargin);
      const rightSpace = Math.max(0, window.innerWidth - bounds.right - chatGap - viewportMargin);
      const placeChatLeft = leftSpace >= preferredWidth || leftSpace >= rightSpace;
      const availableWidth = placeChatLeft ? leftSpace : rightSpace;
      const aboveSpace = Math.max(0, bounds.bottom - viewportMargin);
      const belowSpace = Math.max(0, window.innerHeight - bounds.bottom - chatGap - viewportMargin);
      const placeChatBelow = aboveSpace < preferredHeight && belowSpace > aboveSpace;
      const availableHeight = placeChatBelow ? belowSpace : aboveSpace;

      setDock({ left: !placeChatLeft, top: placeChatBelow });
      setChatSize({
        width: Math.max(160, Math.min(preferredWidth, availableWidth || preferredWidth)),
        height: Math.max(160, Math.min(preferredHeight, availableHeight || preferredHeight)),
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, position, autoWalk]);

  const stopPressAndHoldVoice = useCallback(() => {
    voicePressedRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // The recognition result has already been released by the browser.
    }
  }, []);

  const stopCallRecognition = useCallback(() => {
    const recognition = callRecognitionRef.current;
    callRecognitionRef.current = null;
    if (!recognition) return;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // The browser may already have ended the recognition session.
    }
  }, []);

  const stopActiveAudio = useCallback((updateUi = true) => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    stopAudioPlayback(
      { audio: audioRef.current, objectUrl: audioObjectUrlRef.current },
      URL,
    );
    audioRef.current = null;
    audioObjectUrlRef.current = null;
    if (updateUi) setSpeakingMessageId(null);
  }, []);

  const stopAllVoice = useCallback(
    ({ resetUi = true }: { resetUi?: boolean } = {}) => {
      stopPressAndHoldVoice();
      stopCallRecognition();
      clearCallTimers();
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
      const session = callSessionRef.current;
      if (session) callSessionRef.current = invalidateVoiceSession(session, "ended");
      callActiveRef.current = false;
      callMutedRef.current = false;
      stopActiveAudio(resetUi);
      if (!resetUi) return;
      setVoiceStatus("idle");
      setCallPhase("idle");
      setCallNotice("");
      setCallTranscript("");
      setCallReply("");
      setCopiedMessageId(null);
      setBusy(false);
    },
    [clearCallTimers, stopActiveAudio, stopCallRecognition, stopPressAndHoldVoice],
  );

  useEffect(
    () => () => {
      stopAllVoice({ resetUi: false });
    },
    [stopAllVoice],
  );

  function isCurrentVoiceCall(sessionId: number) {
    const session = callSessionRef.current;
    return Boolean(
      session &&
        callActiveRef.current &&
        !callMutedRef.current &&
        canApplyVoiceSessionResult(session, sessionId),
    );
  }

  function isCurrentVoiceCallListening(sessionId: number) {
    const session = callSessionRef.current;
    return Boolean(session?.phase === "listening" && isCurrentVoiceCall(sessionId));
  }

  function setVoiceCallError(sessionId: number, message: string) {
    const session = callSessionRef.current;
    if (!isCurrentVoiceCall(sessionId)) return;
    if (session) callSessionRef.current = invalidateVoiceSession(session, "ended");
    callActiveRef.current = false;
    callMutedRef.current = false;
    stopCallRecognition();
    clearCallTimers();
    stopActiveAudio();
    setCallPhase("error");
    setCallNotice(message);
    setBusy(false);
  }

  async function requestAssistantReply(
    content: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    signal?: AbortSignal,
    onEvent?: (event: AiChatStreamEvent) => void,
    attachment?: File | null,
  ): Promise<AssistantReply> {
    const formData = attachment ? new FormData() : null;
    if (formData && attachment) {
      formData.append("message", content);
      formData.append("history", JSON.stringify(history));
      formData.append("userId", difyUserId);
      if (difyConversationIdRef.current) {
        formData.append("conversationId", difyConversationIdRef.current);
      }
      formData.append("attachment", attachment);
    }

    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (!formData) headers["Content-Type"] = "application/json";
    const response = await fetch("/api/ai-chat", {
      method: "POST",
      signal,
      headers,
      body: formData ?? JSON.stringify({
        message: content,
        history,
        userId: difyUserId,
        conversationId: difyConversationIdRef.current,
      }),
    });
    if (!response.ok) {
      let errorMessage = "我现在没有连上知识服务，请稍后再问一次。";
      try {
        const payload = (await response.json()) as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.trim()) {
          errorMessage = payload.error.trim();
        }
      } catch {
        // Keep the generic fallback for network errors or non-JSON responses.
      }
      throw new Error(errorMessage);
    }

    const data = await readAiChatResponse(response, onEvent);
    if (data.conversationId) difyConversationIdRef.current = data.conversationId;
    return {
      text: data.reply?.trim() || "资料库暂时没有返回内容，请换个问法试试。",
      photos: data.photos,
      labLinks: data.labLinks,
      attachment: data.attachment,
      agentResult: data.agentResult,
    };
  }

  function updatePetMessage(messageId: number, update: (message: PetMessage) => PetMessage) {
    setMessages((current) => current.map((message) => (message.id === messageId ? update(message) : message)));
  }

  function applyAssistantStreamEvent(
    messageId: number,
    event: AiChatStreamEvent,
    onText?: (text: string, mode: "delta" | "complete") => void,
  ) {
    if (event.type === "meta") {
      updatePetMessage(messageId, (message) => ({
        ...message,
        photos: event.photos,
        labLinks: event.labLinks,
        attachment: event.attachment ?? message.attachment,
        agentResult: event.agentResult ?? message.agentResult,
      }));
    } else if (event.type === "delta") {
      updatePetMessage(messageId, (message) => ({ ...message, text: `${message.text}${event.delta}` }));
      onText?.(event.delta, "delta");
    } else if (event.type === "done") {
      updatePetMessage(messageId, (message) => ({
        ...message,
        text: event.reply,
        photos: event.photos,
        labLinks: event.labLinks,
        attachment: event.attachment ?? message.attachment,
        agentResult: event.agentResult ?? message.agentResult,
      }));
      onText?.(event.reply, "complete");
    }
  }

  function resumeVoiceCallListening(sessionId: number) {
    const session = callSessionRef.current;
    if (!session || !canRestartListening(session, sessionId)) return;
    const listening = transitionCallPhase(session, "listening");
    if (listening.phase !== "listening") return;
    callSessionRef.current = listening;
    setCallPhase("listening");
    setCallNotice("正在聆听，你可以继续说。");
    startCallRecognition(sessionId);
  }

  async function playSpeech(
    sourceText: string,
    options: {
      messageId?: number;
      callSessionId?: number;
      onEnded?: () => void;
    } = {},
  ) {
    const text = toSpeechText(sourceText);
    if (!text) return false;
    stopActiveAudio();

    const controller = new AbortController();
    let audio: HTMLAudioElement | null = null;
    ttsAbortRef.current = controller;
    try {
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("TTS request failed");

      const blob = await response.blob();
      if (controller.signal.aborted) return false;
      if (options.callSessionId !== undefined && !isCurrentVoiceCall(options.callSessionId)) {
        return false;
      }

      const objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audio.muted = options.callSessionId !== undefined && !speakerEnabledRef.current;
      audioRef.current = audio;
      audioObjectUrlRef.current = objectUrl;
      if (options.messageId !== undefined) setSpeakingMessageId(options.messageId);
      audio.onended = () => {
        if (audioRef.current !== audio) return;
        stopActiveAudio();
        options.onEnded?.();
      };
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        stopActiveAudio();
        if (options.callSessionId !== undefined && isCurrentVoiceCall(options.callSessionId)) {
          resumeVoiceCallListening(options.callSessionId);
        } else if (options.messageId !== undefined) {
          setVoiceNotice("语音暂时不可用，文字内容仍可继续查看。");
        }
      };
      await audio.play();
      return true;
    } catch {
      const shouldReportPlayFailure = !controller.signal.aborted;
      if (audio && audioRef.current === audio) {
        stopActiveAudio();
      }
      if (shouldReportPlayFailure) {
        if (options.callSessionId !== undefined && isCurrentVoiceCall(options.callSessionId)) {
          setCallNotice("语音暂时不可用，已保留文字回复。继续说话可重试。");
        } else if (options.messageId !== undefined) {
          setVoiceNotice("语音暂时不可用，文字内容仍可继续查看。");
        }
      }
      return false;
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }
  }

  function handleCopyMessage(message: PetMessage) {
    const text = toSpeechText(message.text);
    if (!text || !navigator.clipboard?.writeText) {
      setVoiceNotice("复制暂时不可用，请手动选择回复内容。");
      return;
    }
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedMessageId(message.id);
        if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = window.setTimeout(() => setCopiedMessageId(null), 1600);
      })
      .catch(() => setVoiceNotice("复制失败，请手动选择回复内容。"));
  }

  function toggleMessageSpeech(message: PetMessage) {
    if (speakingMessageId === message.id) {
      stopActiveAudio();
      return;
    }
    void playSpeech(message.text, { messageId: message.id });
  }

  async function processVoiceCallTranscript(transcript: string, sessionId: number) {
    const session = callSessionRef.current;
    if (!session || !isCurrentVoiceCallListening(sessionId)) return;
    callFinalTranscriptRef.current = "";
    stopCallRecognition();
    const thinking = transitionCallPhase(session, "thinking");
    if (thinking.phase !== "thinking") return;
    callSessionRef.current = thinking;
    setCallPhase("thinking");
    setCallReply("");
    setCallTranscript(transcript);
    setCallNotice("科小贝正在整理并回答。");

    const userMessageId = messageIdRef.current++;
    const assistantMessageId = messageIdRef.current++;
    const history = messagesRef.current.slice(-12).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: transcript },
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    setBusy(true);

    try {
      const reply = await requestAssistantReply(
        transcript,
        history,
        thinking.abortController.signal,
        (event) =>
          applyAssistantStreamEvent(assistantMessageId, event, (text, mode) => {
            setCallReply((current) => (mode === "complete" ? text : `${current}${text}`));
          }),
      );
      if (!isCurrentVoiceCall(sessionId)) return;

      setCallReply(reply.text);
      updatePetMessage(assistantMessageId, (message) => ({
        ...message,
        text: reply.text,
        photos: reply.photos,
        labLinks: reply.labLinks,
        attachment: reply.attachment,
        agentResult: reply.agentResult,
      }));

      const current = callSessionRef.current;
      if (!current) return;
      const speaking = transitionCallPhase(current, "speaking");
      if (speaking.phase !== "speaking") return;
      callSessionRef.current = speaking;
      setCallPhase("speaking");
      setCallNotice("科小贝正在播报。");
      const started = await playSpeech(reply.text, {
        callSessionId: sessionId,
        onEnded: () => resumeVoiceCallListening(sessionId),
      });
      if (!started && isCurrentVoiceCall(sessionId)) resumeVoiceCallListening(sessionId);
    } catch {
      if (!isCurrentVoiceCall(sessionId)) return;
      updatePetMessage(assistantMessageId, (message) => ({
        ...message,
        text: "我现在没有连上知识服务，请稍后再问一次。",
      }));
      setVoiceCallError(sessionId, "对话服务暂时不可用，可以返回文字对话。");
    } finally {
      if (callActiveRef.current && callSessionIdRef.current === sessionId) setBusy(false);
    }
  }

  function startCallRecognition(sessionId: number) {
    if (!isCurrentVoiceCall(sessionId) || callRecognitionRef.current) return;
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceCallError(sessionId, "当前浏览器不支持语音通话，请使用文字对话。");
      return;
    }

    const recognition = new Recognition();
    callRecognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "zh-CN";
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (callRecognitionRef.current !== recognition || !isCurrentVoiceCall(sessionId)) return;
      setCallPhase("listening");
      setCallNotice("正在聆听，请直接说出问题。");
    };
    recognition.onresult = (event) => {
      if (callRecognitionRef.current !== recognition || !isCurrentVoiceCallListening(sessionId)) return;
      const fragment = extractFinalTranscript(event).trim();
      if (!fragment) return;
      callFinalTranscriptRef.current += fragment;
      if (callFinalTimerRef.current) window.clearTimeout(callFinalTimerRef.current);
      setCallTranscript(callFinalTranscriptRef.current);
      callFinalTimerRef.current = window.setTimeout(() => {
        callFinalTimerRef.current = null;
        const transcript = callFinalTranscriptRef.current.trim();
        callFinalTranscriptRef.current = "";
        void processVoiceCallTranscript(transcript, sessionId);
      }, 480);
    };
    recognition.onerror = (event) => {
      if (callRecognitionRef.current !== recognition || !isCurrentVoiceCall(sessionId)) return;
      if (event.error === "no-speech") {
        setCallNotice("没有听清，请再说一次。");
        return;
      }
      const errors: Record<string, string> = {
        "not-allowed": "麦克风权限未开启，请在浏览器设置中允许访问。",
        "service-not-allowed": "浏览器已禁用语音识别服务，请使用文字对话。",
        "audio-capture": "没有检测到可用的麦克风，请使用文字对话。",
        network: "语音识别服务暂时无法连接，请使用文字对话。",
      };
      setVoiceCallError(sessionId, errors[event.error] ?? "语音通话暂时不可用，请使用文字对话。");
    };
    recognition.onend = () => {
      if (callRecognitionRef.current !== recognition) return;
      callRecognitionRef.current = null;
      const current = callSessionRef.current;
      if (
        !current ||
        !isCurrentVoiceCall(sessionId) ||
        current.phase !== "listening" ||
        callMutedRef.current
      ) {
        return;
      }
      callRestartTimerRef.current = window.setTimeout(() => {
        callRestartTimerRef.current = null;
        startCallRecognition(sessionId);
      }, 220);
    };
    try {
      recognition.start();
    } catch {
      callRecognitionRef.current = null;
      setVoiceCallError(sessionId, "麦克风启动失败，请使用文字对话。");
    }
  }

  function startVoiceCall() {
    if (callActiveRef.current) return;
    if (!getSpeechRecognitionConstructor()) {
      setCallPhase("error");
      setCallNotice("当前浏览器不支持语音通话，请使用文字对话。");
      return;
    }
    stopPressAndHoldVoice();
    stopActiveAudio();
    clearCallTimers();
    const session = beginVoiceSession(callSessionIdRef.current);
    callSessionRef.current = session;
    callSessionIdRef.current = session.id;
    callActiveRef.current = true;
    callMutedRef.current = false;
    speakerEnabledRef.current = true;
    setSpeakerEnabled(true);
    setCallPhase("preparing");
    setCallNotice("正在准备麦克风。");
    setCallTranscript("");
    setCallReply("");
    startCallRecognition(session.id);
  }

  function toggleCallMute() {
    if (!callActiveRef.current) return;
    if (callMutedRef.current) {
      stopActiveAudio();
      clearCallTimers();
      const session = beginVoiceSession(callSessionIdRef.current);
      callSessionRef.current = session;
      callSessionIdRef.current = session.id;
      callMutedRef.current = false;
      setCallPhase("listening");
      setCallNotice("麦克风已恢复，正在聆听。");
      startCallRecognition(session.id);
      return;
    }

    const session = callSessionRef.current;
    if (session) callSessionRef.current = invalidateVoiceSession(session, "muted");
    callMutedRef.current = true;
    stopCallRecognition();
    clearCallTimers();
    setCallPhase("muted");
    setCallNotice("麦克风已静音，恢复后可以继续对话。");
  }

  function toggleCallSpeaker() {
    const nextEnabled = !speakerEnabledRef.current;
    speakerEnabledRef.current = nextEnabled;
    if (audioRef.current && callActiveRef.current) {
      audioRef.current.muted = !nextEnabled;
    }
    setSpeakerEnabled(nextEnabled);
  }

  function endVoiceCall() {
    stopAllVoice();
  }

  function handleCloseChat() {
    stopAllVoice();
    setMoreMenuOpen(false);
    setCreationDialog(null);
    setOpen(false);
  }

  function resizeComposerInput(element = inputRef.current) {
    if (!element) return;
    element.style.setProperty("height", "auto");
    element.style.setProperty("height", `${Math.min(element.scrollHeight, 112)}px`);
  }

  useEffect(() => {
    resizeComposerInput();
  }, [input, open]);

  function focusComposerInput() {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      resizeComposerInput();
    });
  }

  function openCreationDialog(kind: CreationDialogKind) {
    setMoreMenuOpen(false);
    setCreationDialog(kind);
    setCreationDialogError("");
    setCreationForm(emptyCreationForm);
  }

  function handleMoreAction(action: CreationAction) {
    setMoreMenuOpen(false);
    if (action === "upload") {
      attachmentInputRef.current?.click();
      return;
    }
    if (action === "photo") {
      photoInputRef.current?.click();
      return;
    }
    openCreationDialog(action);
  }

  function handleCreationFieldChange(field: keyof CreationFormState, value: string) {
    setCreationForm((current) => ({ ...current, [field]: value }));
    setCreationDialogError("");
  }

  function submitCreationDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationDialog) return;

    const { ageGroup, topic, duration, purpose, format } = creationForm;
    if (creationDialog === "analysis" && !selectedAttachment) {
      setCreationDialogError("请先上传教案或研修材料");
      return;
    }
    if (creationDialog !== "analysis" && !ageGroup) {
      setCreationDialogError("请选择适用年龄段");
      return;
    }
    if (creationDialog === "plan" && (!topic.trim() || !duration)) {
      setCreationDialogError("请填写主题并选择活动时长");
      return;
    }
    if (creationDialog === "document" && (!topic.trim() || !purpose.trim())) {
      setCreationDialogError("请填写主题和使用用途");
      return;
    }

    const attachmentName = selectedAttachment?.name ?? "已上传材料";
    const prompt = creationDialog === "plan"
      ? `请生成一份完整教案。年龄段：${ageGroup}；主题：${topic.trim()}；活动时长：${duration}；输出格式：${format}。`
      : creationDialog === "document"
        ? `请策划课件或教学文档。年龄段：${ageGroup}；主题：${topic.trim()}；使用用途：${purpose.trim()}；输出格式：${format}。`
        : `请分析我上传的《${attachmentName}》教案或研修材料，给出结构、目标、过程和可执行的改进建议。${purpose.trim() ? `重点关注：${purpose.trim()}。` : ""}`;

    setInput(prompt);
    setCreationDialog(null);
    setCreationDialogError("");
    focusComposerInput();
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>, mode: "file" | "photo" = "file") {
    const attachment = event.target.files?.[0];
    if (!attachment) return;

    if (attachmentPreviewUrlRef.current) URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    const previewUrl = attachment.type.startsWith("image/")
      ? URL.createObjectURL(attachment)
      : null;
    attachmentPreviewUrlRef.current = previewUrl;
    setAttachmentPreviewUrl(previewUrl);
    setSelectedAttachment(attachment);
    if (mode === "photo") {
      setInput("请识别这张图片中的科学内容，并给出适合幼儿的观察建议。");
      focusComposerInput();
    }
  }

  function removeAttachment() {
    if (attachmentPreviewUrlRef.current) URL.revokeObjectURL(attachmentPreviewUrlRef.current);
    attachmentPreviewUrlRef.current = null;
    setAttachmentPreviewUrl(null);
    setSelectedAttachment(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function sendMessage(prompt: string) {
    const content = prompt.trim();
    if (!content || busy || callActiveRef.current) return;

    const userMessageId = messageIdRef.current++;
    const assistantMessageId = messageIdRef.current++;
    const attachment = selectedAttachment;
    const history = messages.slice(-12).map((message) => ({
      role: message.role,
      content: message.text,
    }));

    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: content },
      { id: assistantMessageId, role: "assistant", text: "" },
    ]);
    setInput("");
    window.requestAnimationFrame(() => resizeComposerInput());
    setBusy(true);

    let requestSucceeded = false;
    try {
      const reply = await requestAssistantReply(
        content,
        history,
        undefined,
        (event) => applyAssistantStreamEvent(assistantMessageId, event),
        attachment,
      );
      updatePetMessage(assistantMessageId, (message) => ({
        ...message,
        text: reply.text,
        photos: reply.photos,
        labLinks: reply.labLinks,
        attachment: reply.attachment,
        agentResult: reply.agentResult,
      }));
      requestSucceeded = true;
    } catch (error) {
      const errorMessage = error instanceof Error && error.message.trim()
        ? error.message
        : "我现在没有连上知识服务，请稍后再问一次。";
      updatePetMessage(assistantMessageId, (message) => ({
        ...message,
        text: errorMessage,
      }));
    } finally {
      setBusy(false);
      if (attachment && requestSucceeded) removeAttachment();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function toggleComposerMode() {
    if (busy || callPhase !== "idle" || voiceStatus === "processing") return;

    setMoreMenuOpen(false);

    if (composerMode === "voice") {
      voicePressedRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          recognition.abort();
        }
      }
      setComposerMode("text");
      setVoiceStatus("idle");
      setVoiceNotice("");
      window.requestAnimationFrame(() => focusComposerInput());
      return;
    }

    setComposerMode("voice");
    setVoiceNotice("");
  }

  function startVoiceInput(event: ReactPointerEvent<HTMLButtonElement>) {
    if (busy || callPhase !== "idle" || callActiveRef.current || voiceStatus === "starting" || voiceStatus === "listening") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const Recognition = getSpeechRecognitionConstructor();
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
    if (event.pointerType === "mouse" && event.button !== 0) return;

    if (autoWalk && petRootRef.current) {
      const bounds = petRootRef.current.getBoundingClientRect();
      const { minBottom, maxBottom } = getPetBottomBounds();
      const current = {
        right: window.innerWidth - bounds.right,
        bottom: clamp(window.innerHeight - bounds.bottom, minBottom, maxBottom),
      };
      positionRef.current = current;
      setPosition(current);
      setDock({
        left: (window.innerWidth - current.right - petWidth / 2) < window.innerWidth / 2,
        top: (window.innerHeight - current.bottom - petHeight / 2) < window.innerHeight / 2,
      });
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

    const { minBottom, maxBottom } = getPetBottomBounds();
    const right = clamp(
      drag.startRight - deltaX,
      viewportMargin,
      window.innerWidth - petWidth - viewportMargin,
    );
    const bottom = clamp(
      drag.startBottom - deltaY,
      minBottom,
      maxBottom,
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
    if (open) {
      stopAllVoice();
      setOpen(false);
      return;
    }
    setOpen(true);
  }

  const visibleFrame = spriteFrame % animation.durations.length;
  const spriteStyle = {
    "--pet-x": `${(visibleFrame / 7) * 100}%`,
    "--pet-y": `${(animation.row / 10) * 100}%`,
  } as CSSProperties;
  const callInputLocked = callPhase !== "idle" && callPhase !== "error";

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
      style={positionReady ? { right: position.right, bottom: position.bottom } : undefined}
    >
      <AnimatePresence>
        {open ? (
          <motion.section
            className="pet-chat"
            aria-label="科小贝智能助手"
            style={{
              "--pet-chat-max-width": `${chatSize.width}px`,
              "--pet-chat-max-height": `${chatSize.height}px`,
            } as CSSProperties}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            {callPhase === "idle" ? (
              <header className="pet-chat__header">
                <span>
                  <GardenSeal glyph="贝" size="mini" tone="gold" />
                  科小贝
                </span>
                <div className="pet-chat__header-actions">
                  <button
                    type="button"
                    onClick={startVoiceCall}
                    disabled={callPhase !== "idle" && callPhase !== "error"}
                    aria-label="开启语音通话"
                    title="开启语音通话"
                  >
                    <PhoneCall size={16} />
                  </button>
                  <button type="button" onClick={handleCloseChat} aria-label="关闭对话" title="关闭对话">
                    <X size={17} />
                  </button>
                </div>
              </header>
            ) : null}

            {callPhase !== "idle" ? (
              <section className="pet-call" aria-label="科小贝通话" aria-live="polite">
                <div className="pet-call__pet-stage" aria-hidden="true">
                  <div className="pet-call__pet-orbit">
                    <span className="science-pet__sprite pet-call__pet" data-pet-state={animationState} style={spriteStyle} />
                  </div>
                </div>

                <div className={`pet-call__wave pet-call__wave--${callPhase}`} aria-label="声纹动态">
                  {Array.from({ length: 13 }, (_, index) => <i key={index} />)}
                </div>

                <span className="sr-only" role="status">{callNotice}</span>
                <div className="pet-call__messages" aria-label="通话中的聊天内容">
                  {!callReply && !callTranscript ? (
                    <div className="pet-call__bubble pet-call__bubble--assistant">
                      <span className="pet-call__who">科小贝</span>
                      <p>你好，我可以帮你准备科学活动。</p>
                    </div>
                  ) : null}
                  {callTranscript ? (
                    <div className="pet-call__bubble pet-call__bubble--user">
                      <span className="pet-call__who">你</span>
                      <p>{callTranscript}</p>
                    </div>
                  ) : null}
                  {callPhase === "thinking" && !callReply ? (
                    <div className="pet-call__bubble pet-call__bubble--assistant">
                      <span className="thinking-copy">
                        <ThinkingGhost />
                        <span>正在思考</span>
                      </span>
                    </div>
                  ) : null}
                  {callReply ? (
                    <div className="pet-call__bubble pet-call__bubble--assistant">
                      <span className="pet-call__who">科小贝</span>
                      <p>{callReply}</p>
                    </div>
                  ) : null}
                  {callPhase === "error" ? (
                    <div className="pet-call__error" role="alert">
                      <p>{callNotice}</p>
                      <button type="button" className="pet-call__text-action" onClick={endVoiceCall}>
                        返回文字对话
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="pet-call__controls">
                  <button
                    type="button"
                    className={`pet-call__control${callPhase === "muted" ? " is-muted" : ""}`}
                    onClick={toggleCallMute}
                    disabled={callPhase === "error"}
                    aria-label={callPhase === "muted" ? "恢复麦克风" : "静音麦克风"}
                    title={callPhase === "muted" ? "恢复麦克风" : "静音麦克风"}
                  >
                    {callPhase === "muted" ? <Mic size={19} /> : <MicOff size={19} />}
                    <span>静音</span>
                  </button>
                  <button
                    type="button"
                    className="pet-call__control pet-call__control--end"
                    onClick={endVoiceCall}
                    aria-label="结束通话"
                    title="结束通话"
                  >
                    <PhoneOff size={19} />
                    <span>挂断</span>
                  </button>
                  <button
                    type="button"
                    className={`pet-call__control${speakerEnabled ? "" : " is-muted"}`}
                    onClick={toggleCallSpeaker}
                    aria-label="扬声器"
                    title={speakerEnabled ? "关闭扬声器" : "打开扬声器"}
                  >
                    {speakerEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
                    <span>扬声器</span>
                  </button>
                </div>
              </section>
            ) : (
              <>
                <div ref={scrollRef} className="pet-chat__messages" aria-live="polite">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`pet-message pet-message--${message.role}`}
                    >
                      {message.role === "assistant" ? (
                        <div className="pet-message__markdown">
                          <Markdown>{assistantDisplayText(message.text, message.agentResult?.kind)}</Markdown>
                        </div>
                      ) : (
                        message.text
                      )}
                      {message.role === "assistant" && message.agentResult ? (
                        <AgentResultCard result={message.agentResult} />
                      ) : null}
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
                      {message.labLinks?.length ? (
                        <div className="pet-message__lab-links">
                          {message.labLinks.map((link) => (
                            <Link className="pet-message__lab-link" href={link.href} key={link.id}>
                              查看《{link.title}》
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {message.attachment?.status === "unavailable" && message.attachment.message ? (
                        <p className="pet-message__attachment-status" role="status">
                          {message.attachment.message}
                        </p>
                      ) : null}
                      {message.role === "assistant" && message.text ? (
                        <div className="pet-message__actions">
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(message)}
                            aria-label={copiedMessageId === message.id ? "已复制回复" : "复制回复"}
                            title={copiedMessageId === message.id ? "已复制" : "复制回复"}
                          >
                            {copiedMessageId === message.id ? <Check size={13} /> : <Copy size={13} />}
                            <span>{copiedMessageId === message.id ? "已复制" : "复制"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMessageSpeech(message)}
                            aria-label={speakingMessageId === message.id ? "停止播放" : "播放回复"}
                            title={speakingMessageId === message.id ? "停止播放" : "播放回复"}
                          >
                            {speakingMessageId === message.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                            <span>{speakingMessageId === message.id ? "停止" : "播放"}</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {busy ? (
                    <div className="pet-message pet-message--assistant">
                      <span className="thinking-copy">
                        <ThinkingGhost />
                        <span>正在思考</span>
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="pet-chat__starters">
                  {starters.map((starter) => (
                    <button key={starter} type="button" onClick={() => void sendMessage(starter)}>
                      {starter}
                    </button>
                  ))}
                </div>
              </>
            )}

            {callPhase === "idle" ? (
              <div className="pet-chat__composer">
                {voiceNotice ? (
                  <p className="pet-chat__voice-feedback" role="status">
                    {voiceNotice}
                  </p>
                ) : null}
                {selectedAttachment ? (
                  <div className="pet-chat__attachment-preview">
                    {attachmentPreviewUrl ? (
                      <>
                        {/* Local object URLs are preview-only and cannot use Next image optimization. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="pet-chat__attachment-thumbnail"
                          src={attachmentPreviewUrl}
                          alt="附件缩略图"
                        />
                      </>
                    ) : (
                      <span className="pet-chat__attachment-file-icon" aria-hidden="true">
                        <FileText size={17} />
                      </span>
                    )}
                    <span className="pet-chat__attachment-name" title={selectedAttachment.name}>
                      {selectedAttachment.name}
                    </span>
                    <button
                      type="button"
                      className="pet-chat__attachment-remove"
                      aria-label={`移除附件 ${selectedAttachment.name}`}
                      title="移除附件"
                      onClick={removeAttachment}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                <input
                  ref={attachmentInputRef}
                  className="pet-chat__attachment-input"
                  type="file"
                  accept="image/*,.txt,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                  onChange={handleAttachmentChange}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <input
                  ref={photoInputRef}
                  className="pet-chat__attachment-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handleAttachmentChange(event, "photo")}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <form className="pet-chat__form" onSubmit={handleSubmit}>
                  <div className="pet-chat__more" ref={moreMenuRef}>
                    <button
                      type="button"
                      className="pet-chat__composer-control pet-chat__more-trigger"
                      aria-label="更多功能"
                      aria-expanded={moreMenuOpen}
                      aria-haspopup="menu"
                      title="更多功能"
                      disabled={busy || callInputLocked}
                      onClick={() => setMoreMenuOpen((isOpen) => !isOpen)}
                    >
                      <ChevronUp size={18} />
                    </button>
                    {moreMenuOpen ? (
                      <div className="pet-chat__more-menu" role="menu" aria-label="更多功能">
                        {creationActions.map((action) => (
                          <button
                            key={action.type}
                            type="button"
                            role="menuitem"
                            onClick={() => handleMoreAction(action.type)}
                          >
                            {action.type === "upload" ? <Upload size={16} /> : null}
                            {action.type === "photo" ? <Camera size={16} /> : null}
                            {action.type === "plan" ? <Sparkles size={16} /> : null}
                            {action.type === "document" ? <FileText size={16} /> : null}
                            {action.type === "analysis" ? <ClipboardList size={16} /> : null}
                            <span>{action.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="pet-chat__composer-control pet-chat__voice-mode"
                    aria-label={composerMode === "voice" ? "切换文字输入" : "切换语音输入"}
                    title={composerMode === "voice" ? "切换文字输入" : "切换语音输入"}
                    aria-pressed={composerMode === "voice"}
                    disabled={busy || callInputLocked || voiceStatus === "starting" || voiceStatus === "listening" || voiceStatus === "processing"}
                    onClick={toggleComposerMode}
                  >
                    {composerMode === "voice" ? <Keyboard size={17} /> : <Volume2 size={17} />}
                  </button>
                  {composerMode === "voice" ? (
                    <button
                      type="button"
                      className={`pet-chat__voice-button${voiceStatus === "listening" || voiceStatus === "starting" ? " is-listening" : ""}`}
                      disabled={busy || callPhase !== "idle" || voiceStatus === "processing"}
                      onContextMenu={(event) => event.preventDefault()}
                      onPointerCancel={stopVoiceInput}
                      onPointerDown={startVoiceInput}
                      onPointerUp={stopVoiceInput}
                      aria-label="按住说话"
                      aria-pressed={voiceStatus === "listening"}
                      title="按住说话，松开完成"
                    >
                      <Mic size={17} />
                      <span>{voiceStatus === "listening" ? "松开完成" : "按住说话"}</span>
                    </button>
                  ) : (
                    <textarea
                      ref={inputRef}
                      className="pet-chat__input"
                      value={input}
                      rows={1}
                      onChange={(event) => {
                        setInput(event.target.value);
                        resizeComposerInput(event.currentTarget);
                      }}
                      placeholder="问问科小贝..."
                      aria-label="向科小贝提问"
                      disabled={busy || callInputLocked}
                    />
                  )}
                  <button
                    type="submit"
                    className="pet-chat__send"
                    disabled={!input.trim() || busy || callInputLocked || voiceStatus === "listening" || voiceStatus === "starting" || voiceStatus === "processing"}
                    aria-label="发送"
                    title="发送"
                  >
                    <Send size={17} />
                  </button>
                </form>
                {creationDialog ? (
                  <div className="pet-chat__dialog-layer">
                    <form
                      className="pet-chat__dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="pet-chat-dialog-title"
                      onSubmit={submitCreationDialog}
                    >
                      <div className="pet-chat__dialog-header">
                        <h3 id="pet-chat-dialog-title">{creationDialogTitles[creationDialog]}</h3>
                        <button
                          type="button"
                          className="pet-chat__dialog-close"
                          aria-label="关闭弹窗"
                          title="关闭"
                          onClick={() => setCreationDialog(null)}
                        >
                          <X size={17} />
                        </button>
                      </div>

                      {creationDialog === "analysis" ? (
                        <>
                          <p className="pet-chat__dialog-hint">上传教案或研修材料后，再填写希望重点关注的内容。</p>
                          <button
                            type="button"
                            className="pet-chat__dialog-upload"
                            onClick={() => attachmentInputRef.current?.click()}
                          >
                            <Upload size={16} />
                            <span>选择教案或研修材料</span>
                          </button>
                          <p className="pet-chat__dialog-file">
                            {selectedAttachment ? `已选择：${selectedAttachment.name}` : "支持 PDF、Word、PPT、TXT 等文件"}
                          </p>
                          <label className="pet-chat__field">
                            <span>重点关注（可选）</span>
                            <input
                              value={creationForm.purpose}
                              onChange={(event) => handleCreationFieldChange("purpose", event.target.value)}
                              placeholder="例如：活动目标和幼儿参与度"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="pet-chat__field">
                            <span>年龄段 <i>*</i></span>
                            <select
                              required
                              value={creationForm.ageGroup}
                              onChange={(event) => handleCreationFieldChange("ageGroup", event.target.value)}
                            >
                              <option value="">请选择年龄段</option>
                              {creationAgeGroups.map((ageGroup) => <option key={ageGroup}>{ageGroup}</option>)}
                            </select>
                          </label>
                          <label className="pet-chat__field">
                            <span>主题 <i>*</i></span>
                            <input
                              required
                              value={creationForm.topic}
                              onChange={(event) => handleCreationFieldChange("topic", event.target.value)}
                              placeholder="例如：纸片的力量"
                            />
                          </label>
                          {creationDialog === "document" ? (
                            <label className="pet-chat__field">
                              <span>使用用途 <i>*</i></span>
                              <input
                                required
                                value={creationForm.purpose}
                                onChange={(event) => handleCreationFieldChange("purpose", event.target.value)}
                                placeholder="例如：家长会展示"
                              />
                            </label>
                          ) : (
                            <label className="pet-chat__field">
                              <span>活动时长 <i>*</i></span>
                              <select
                                required
                                value={creationForm.duration}
                                onChange={(event) => handleCreationFieldChange("duration", event.target.value)}
                              >
                                <option value="">请选择时长</option>
                                {creationDurations.map((duration) => <option key={duration}>{duration}</option>)}
                              </select>
                            </label>
                          )}
                          <label className="pet-chat__field">
                            <span>输出格式</span>
                            <select
                              value={creationForm.format}
                              onChange={(event) => handleCreationFieldChange("format", event.target.value)}
                            >
                              {creationFormats.map((format) => <option key={format}>{format}</option>)}
                            </select>
                          </label>
                        </>
                      )}

                      {creationDialogError ? <p className="pet-chat__dialog-error" role="alert">{creationDialogError}</p> : null}
                      <div className="pet-chat__dialog-actions">
                        <button type="button" className="pet-chat__dialog-cancel" onClick={() => setCreationDialog(null)}>
                          取消
                        </button>
                        <button type="submit" className="pet-chat__dialog-submit">
                          填入对话框
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : null}
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
