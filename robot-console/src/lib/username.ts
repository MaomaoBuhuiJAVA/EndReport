/** Usernames are separate from display names and cannot be confused with a phone. */
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const username = value.trim().normalize("NFKC").toLowerCase();
  return /^[\p{Script=Han}a-z][\p{Script=Han}a-z0-9_]{1,23}$/u.test(username) ? username : null;
}
