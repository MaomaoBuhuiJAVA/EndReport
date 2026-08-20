type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

/** Best-effort protection for anonymous serverless endpoints. */
export function checkPublicRateLimit(request: Request, name: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = `${name}:${clientKey(request)}`;
  const previous = buckets.get(key);
  const bucket = !previous || previous.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : previous;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [entryKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(entryKey);
  }
  if (bucket.count > limit) {
    return new Response(JSON.stringify({ error: "操作过于频繁，请稍后再试" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))), "Cache-Control": "no-store" },
    });
  }
  return null;
}
