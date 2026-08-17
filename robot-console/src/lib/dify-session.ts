export function createDifyWebUserId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `web-${uuid}`;

  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
