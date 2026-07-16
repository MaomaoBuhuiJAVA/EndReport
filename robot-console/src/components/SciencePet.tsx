"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles, X } from "lucide-react";
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

const starters = ["推荐一个亲子实验", "找一首小班科学诗"];
const petWidth = 116;
const petHeight = 122;
const viewportMargin = 6;
const idleFrameDurations = [1680, 660, 660, 840, 840, 1920];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function SciencePet() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [idleFrame, setIdleFrame] = useState(0);
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
  const positionRef = useRef(position);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let currentFrame = 0;
    let timer = 0;
    const scheduleNextFrame = () => {
      timer = window.setTimeout(() => {
        currentFrame = (currentFrame + 1) % idleFrameDurations.length;
        setIdleFrame(currentFrame);
        scheduleNextFrame();
      }, idleFrameDurations[currentFrame]);
    };

    scheduleNextFrame();
    return () => window.clearTimeout(timer);
  }, []);

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

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
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

  const spriteStyle = {
    "--pet-x": `${(idleFrame / 7) * 100}%`,
  } as CSSProperties;

  return (
    <div
      className={[
        "science-pet",
        open ? "is-open" : "",
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
                <Sparkles size={16} />
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

            <form className="pet-chat__form" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="问问科小贝..."
                aria-label="向科小贝提问"
                disabled={busy}
              />
              <button type="submit" disabled={!input.trim() || busy} title="发送">
                <Send size={17} />
              </button>
            </form>
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
          style={spriteStyle}
        />
      </button>
    </div>
  );
}
