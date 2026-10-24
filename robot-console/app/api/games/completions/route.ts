import { getGameRepository } from "@/lib/science-games/server-db";
import { gameError, gameReply, gameUser, readGameJson } from "@/lib/science-games/server-http";
import { gameCompletionInput } from "@/lib/science-games/server-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await readGameJson(request);
    const user = await gameUser(request);
    const input = gameCompletionInput(body);
    return gameReply(await getGameRepository().complete(user.id, input));
  } catch (error) { return gameError(error); }
}
