"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, CornerDownLeft, MessageCircle, Minus, Sparkles } from "lucide-react";
import type { ConversationMessage } from "@/lib/types";

const starters = ["今天适合安排什么互动？", "孩子摔倒时机器人怎么提醒？", "帮我生成一段晨间问候"];

export function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      role: "assistant",
      content: "你好，我是星芽。可以帮老师准备校园问答、活动话术和机器人陪伴内容。",
    },
  ]);

  const history = useMemo(() => messages.slice(-8), [messages]);

  async function sendMessage(text: string) {
    const content = text.trim();

    if (!content || loading) {
      return;
    }

    setInput("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content }]);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, history }),
      });
      const data = (await response.json()) as { reply?: string };

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.reply ?? "我暂时没有拿到回复，请稍后再试。",
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "网络有点不稳定，但我已经保留了这个问题，稍后可以重新发送。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section className="flex h-[min(680px,calc(100vh-40px))] w-[min(420px,calc(100vw-40px))] flex-col overflow-hidden rounded-[28px] border border-[#d7dde1] bg-[#fbfaf6] shadow-2xl shadow-[#24434a]/20">
          <header className="flex items-center justify-between border-b border-[#dde2de] bg-[#183c43] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-[#f5d56f] text-[#183c43]">
                <Sparkles size={20} />
              </span>
              <div>
                <p className="text-sm text-[#cfe7e1]">校园问答助手</p>
                <h2 className="text-lg font-semibold">星芽 AI</h2>
              </div>
            </div>
            <button
              aria-label="收起 AI 对话"
              className="grid size-10 place-items-center rounded-full text-[#d9ece7] transition hover:bg-white/10"
              onClick={() => setOpen(false)}
              type="button"
            >
              <Minus size={20} />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
            {messages.map((message, index) => (
              <div
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                key={`${message.role}-${index}`}
              >
                <div
                  className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-[#1c5b63] text-white"
                      : "border border-[#dfe7e5] bg-white text-[#233235]"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-3xl border border-[#dfe7e5] bg-white px-4 py-3 text-sm text-[#68787a]">
                  正在思考适合校园场景的回复...
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[#dde2de] bg-white px-4 py-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {starters.map((starter) => (
                <button
                  className="shrink-0 rounded-full border border-[#d3ddd9] px-3 py-2 text-xs text-[#36575b] transition hover:border-[#1c5b63] hover:text-[#1c5b63]"
                  key={starter}
                  onClick={() => void sendMessage(starter)}
                  type="button"
                >
                  {starter}
                </button>
              ))}
            </div>
            <form className="flex items-end gap-2" onSubmit={handleSubmit}>
              <textarea
                className="min-h-12 flex-1 resize-none rounded-2xl border border-[#d4ddda] bg-[#fbfaf6] px-4 py-3 text-sm text-[#233235] outline-none transition placeholder:text-[#9aa6a5] focus:border-[#1c5b63]"
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入教师端问题或校园问答内容"
                rows={1}
                value={input}
              />
              <button
                aria-label="发送消息"
                className="grid size-12 place-items-center rounded-2xl bg-[#e76842] text-white transition hover:bg-[#cb5737] disabled:cursor-not-allowed disabled:bg-[#c8c8c8]"
                disabled={loading || !input.trim()}
                type="submit"
              >
                <CornerDownLeft size={19} />
              </button>
            </form>
          </div>
        </section>
      ) : (
        <button
          aria-label="打开 AI 对话"
          className="group flex items-center gap-3 rounded-full border border-[#d7dde1] bg-[#183c43] px-4 py-3 text-white shadow-2xl shadow-[#24434a]/25 transition hover:-translate-y-0.5 hover:bg-[#214d54]"
          onClick={() => setOpen(true)}
          type="button"
        >
          <span className="grid size-11 place-items-center rounded-full bg-[#f5d56f] text-[#183c43]">
            <Bot size={21} />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold">星芽 AI</span>
            <span className="block text-xs text-[#cde5df]">校园问答与陪伴话术</span>
          </span>
          <MessageCircle className="text-[#f5d56f]" size={19} />
        </button>
      )}
    </div>
  );
}
