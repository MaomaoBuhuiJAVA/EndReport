import { getGameRepository } from "@/lib/science-games/server-db";
import { gameError, gameReply } from "@/lib/science-games/server-http";
import { gameAge } from "@/lib/science-games/server-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const age = gameAge(new URL(request.url).searchParams.get("age"));
    return gameReply(await getGameRepository().leaderboard(age));
  } catch (error) { return gameError(error); }
}
