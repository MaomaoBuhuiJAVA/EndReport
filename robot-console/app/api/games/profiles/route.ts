import { getGameRepository } from "@/lib/science-games/server-db";
import { gameError, gameReply, gameUser, readGameJson } from "@/lib/science-games/server-http";
import { gameProfileInput } from "@/lib/science-games/server-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await readGameJson(request);
    const user = await gameUser(request);
    const input = gameProfileInput(body);
    return gameReply(await getGameRepository().createProfile(user.id, input), 201);
  } catch (error) { return gameError(error); }
}
