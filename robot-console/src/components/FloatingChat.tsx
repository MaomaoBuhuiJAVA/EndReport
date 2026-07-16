"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { Bot, CornerDownLeft, MessageCircle, Minus, Sparkles } from "lucide-react";
import type { ConversationMessage } from "@/lib/types";

type ChatMessage = ConversationMessage & {
  photos?: Array<{ id: string; title: string; url: string; description?: string | null }>;
};

const starters = [
  "园所基本情况是什么？",
  "功能室有没有照片？",
  "教师荣誉有哪些？",
];

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "你好，我是资料检索助手。你可以问我园所概览、功能室、荣誉资质、课程资料、教师资料或云宝信息。",
    },
  ]);

  const history = useMemo(() => messages.slice(-8), [messages]);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || loading) return;

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content }]);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history }),
      });
      const data = (await response.json()) as {
        reply?: string;
        photos?: Array<{ id: string; title: string; url: string; description?: string | null }>;
      };

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.reply ?? "暂时没有拿到回复，请稍后再试。",
          photos: data.photos,
        },
      ]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "网络暂时不稳定，请稍后重试。" }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open ? (
        <section className="flex h-[min(680px,calc(100vh-40px))] w-[min(420px,calc(100vw-40px))] flex-col overflow-hidden rounded-[8px] border border-white/55 bg-white/80 shadow-2xl shadow-[#24434a]/20 backdrop-blur-2xl">
          <header className="flex items-center justify-between border-b border-white/45 bg-[#173b42]/92 px-5 py-4 text-white backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-[#f3c94b] text-[#173b42]">
                <Sparkles size={20} />
              </span>
              <div>
                <p className="text-sm text-[#cfe7e1]">园所问答助手</p>
                <h2 className="text-lg font-semibold">资料检索</h2>
              </div>
            </div>
            <button aria-label="收起对话" className="grid size-10 place-items-center rounded-full text-[#d9ece7] transition hover:bg-white/10" onClick={() => setOpen(false)} type="button">
              <Minus size={20} />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {messages.map((message, index) => (
              <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`} key={`${message.role}-${index}`}>
                <div className={`max-w-[82%] rounded-[8px] px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[#176b5d] text-white" : "border border-[#dfe7e5] bg-white text-[#233235]"}`}>
                  <div>{message.content}</div>
                  {message.photos?.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {message.photos.map((photo) => (
                        <a className="group block overflow-hidden rounded-[8px] border border-white/40 bg-white" href={photo.url} key={photo.id} target="_blank" rel="noreferrer">
                          <Image alt={photo.title} className="h-24 w-full object-cover transition group-hover:scale-105" height={96} src={photo.url} width={180} />
                          <span className="block truncate px-2 py-1 text-xs text-[#36575b]">{photo.title}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-[8px] border border-[#dfe7e5] bg-white px-4 py-3 text-sm text-[#68787a]">正在检索资料库...</div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-white/55 bg-white/78 px-4 py-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {starters.map((starter) => (
                <button className="shrink-0 rounded-full border border-[#d3ddd9] px-3 py-2 text-xs text-[#36575b] transition hover:border-[#176b5d] hover:text-[#176b5d]" key={starter} onClick={() => void sendMessage(starter)} type="button">
                  {starter}
                </button>
              ))}
            </div>
            <form className="flex items-end gap-2" onSubmit={handleSubmit}>
              <textarea
                className="min-h-12 flex-1 resize-none rounded-[8px] border border-[#d4ddda] bg-[#fbfaf6] px-4 py-3 text-sm text-[#233235] outline-none transition placeholder:text-[#9aa6a5] focus:border-[#176b5d]"
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入园所问题、功能室、照片或云宝相关内容"
                rows={1}
                value={input}
              />
              <button aria-label="发送消息" className="grid size-12 place-items-center rounded-[8px] bg-[#f3c94b] text-[#173b42] transition hover:bg-[#e6bb37] disabled:cursor-not-allowed disabled:bg-[#c8c8c8]" disabled={loading || !input.trim()} type="submit">
                <CornerDownLeft size={19} />
              </button>
            </form>
          </div>
        </section>
      ) : (
        <button
          aria-label="打开对话"
          className="group flex items-center gap-3 rounded-full border border-white/60 bg-[#173b42]/92 px-4 py-3 text-white shadow-2xl shadow-[#24434a]/25 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#214d54]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <span className="grid size-11 place-items-center rounded-full bg-[#f3c94b] text-[#173b42]">
            <Bot size={21} />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold">资料问答</span>
            <span className="block text-xs text-[#cde5df]">园所检索与照片展示</span>
          </span>
          <MessageCircle className="text-[#f3c94b]" size={19} />
        </button>
      )}
    </div>
  );
}
