import { notFound } from "next/navigation";
import { MagnetGame } from "@/components/science-games/MagnetGame";
import { WaterGame } from "@/components/science-games/WaterGame";
import { ShadowGame } from "@/components/science-games/ShadowGame";

export default async function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  if (gameId === "magnet") return <MagnetGame />;
  if (gameId === "water") return <WaterGame />;
  if (gameId === "shadow") return <ShadowGame />;
  notFound();
}
