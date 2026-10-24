import { getGameRepository } from "@/lib/science-games/server-db";
import { gameError, gameReply, gameUser, readGameJson } from "@/lib/science-games/server-http";
import { gameProfileInput } from "@/lib/science-games/server-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const body = await readGameJson(request);
    const user = await gameUser(request);
    const { profileId } = await params;
    const input = gameProfileInput(body);
    return gameReply(await getGameRepository().updateProfile(user.id, profileId, input));
  } catch (error) { return gameError(error); }
}
