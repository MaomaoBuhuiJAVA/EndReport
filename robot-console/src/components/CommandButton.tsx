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
  const [sent, setSent] = useState(false);
  const Icon = icons[icon];

  async function sendCommand() {
    setSent(false);
    await fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, type, label }),
    });
    setSent(true);
    window.setTimeout(() => setSent(false), 1600);
  }

  return (
    <button
      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#d7e1de] bg-white px-3 text-sm font-medium text-[#243537] transition hover:-translate-y-0.5 hover:border-[#1c5b63] hover:text-[#1c5b63] hover:shadow-lg hover:shadow-[#24434a]/10"
      onClick={() => void sendCommand()}
      title={sent ? "指令已发送" : label}
      type="button"
    >
      <Icon size={17} />
      <span>{sent ? "已发送" : label}</span>
    </button>
  );
}
