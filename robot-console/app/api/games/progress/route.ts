import { getGameRepository } from "@/lib/science-games/server-db";
import { gameError, gameReply, gameUser } from "@/lib/science-games/server-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await gameUser(request);
    return gameReply({ progress: await getGameRepository().getProgress(user.id) });
  } catch (error) { return gameError(error); }
}
