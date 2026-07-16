"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CircleStop,
  GraduationCap,
  Moon,
  Play,
  Sparkles,
} from "lucide-react";

const icons = {
  arrowUp: ArrowUp,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  stop: CircleStop,
  learning: GraduationCap,
  companion: Sparkles,
  sleep: Moon,
  story: BookOpen,
  song: Play,
};

type CommandButtonProps = {
  deviceId: string;
  type: string;
  label: string;
  icon: keyof typeof icons;
};

export function CommandButton({ deviceId, icon, label, type }: CommandButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const Icon = icons[icon];

  async function sendCommand() {
    setState("sending");

    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, type, label }),
      });

      if (!response.ok) {
        throw new Error("Command failed");
      }

      setState("sent");
    } catch {
      setState("failed");
    } finally {
      window.setTimeout(() => setState("idle"), 1600);
    }
  }

  const copy =
    state === "sending" ? "发送中" : state === "sent" ? "已发送" : state === "failed" ? "失败" : label;

  return (
    <button
      className="flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-[#d7e1de] bg-white px-3 text-sm font-medium text-[#243537] transition hover:-translate-y-0.5 hover:border-[#176b5d] hover:text-[#176b5d] hover:shadow-lg hover:shadow-[#24434a]/10 disabled:cursor-wait disabled:opacity-70"
      disabled={state === "sending"}
      onClick={() => void sendCommand()}
      title={copy}
      type="button"
    >
      <Icon size={17} />
      <span>{copy}</span>
    </button>
  );
}
