import { access } from "node:fs/promises";
import path from "node:path";
import { GAME_ARTWORK } from "@/lib/science-games/artwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Known manifest paths only; no user-controlled filesystem paths. */
export async function GET() {
  const base = path.join(process.cwd(), "public", "assets", "science-games");
  const results = await Promise.all(GAME_ARTWORK.map(async asset => {
    try { await access(path.join(base, asset.file)); return asset.id; }
    catch { return null; }
  }));
  return Response.json({ available: results.filter(Boolean) }, { headers: { "Cache-Control": "no-store" } });
}
