import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GameShell } from "@/components/science-games/GameShell";

export const metadata: Metadata = { title: "科小贝科学乐园", description: "和科小贝一起观察、预测和探索科学小游戏。" };
export default function GamesLayout({ children }: { children: ReactNode }) { return <GameShell>{children}</GameShell>; }
