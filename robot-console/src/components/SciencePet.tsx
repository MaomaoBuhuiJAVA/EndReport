"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Send, Sparkles, X } from "lucide-react";
import Markdown from "react-markdown";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

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

type PetMode = "idle" | "thinking" | "happy";

const modeRow: Record<PetMode, number> = { idle: 0, thinking: 7, happy: 8 };
const modeFrames: Record<PetMode, number> = { idle: 8, thinking: 6, happy: 6 };
const starters = ["推荐一个亲子实验", "找一首小班科学诗"];

export function SciencePet() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PetMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "你好，我是科小贝。想找科学诗、实验教案、亲子玩法或园所资料，都可以问我。",
    },
  ]);
  const [mode, setMode] = useState<PetMode>("idle");
  const [frame, setFrame] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageIdRef = useRef(2);
  const busy = mode === "thinking";

  useEffect(() => {
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % modeFrames[mode]),
      mode === "idle" ? 180 : 140,
    );
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, open]);

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
    setMode("thinking");

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
      setMode("happy");
      window.setTimeout(() => setMode("idle"), 1500);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: "assistant",
          text: "我现在没有连上知识服务，请稍后再问一次。",
        },
      ]);
      setMode("idle");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  const spriteStyle = {
    "--pet-x": `${((frame % modeFrames[mode]) / 7) * 100}%`,
    "--pet-y": `${(modeRow[mode] / 10) * 100}%`,
  } as CSSProperties;

  return (
    <div className={`science-pet${open ? " is-open" : ""}`}>
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
                            <Image
                              alt={photo.title}
                              fill
                              sizes="132px"
                              src={photo.url}
                            />
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
        className="science-pet__button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "收起科小贝" : "问问科小贝"}
        title="问问科小贝"
      >
        <span
          className="science-pet__sprite"
          style={spriteStyle}
          role="img"
          aria-label="科小贝智能助手"
        />
      </button>
    </div>
  );
}
