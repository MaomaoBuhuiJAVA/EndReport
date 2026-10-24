export const ACCOUNT_AVATARS = [
  {key: "sprout", label: "小芽", symbol: "🌱", color: "#e8f2e8"},
  {key: "rocket", label: "探索", symbol: "🚀", color: "#e8eff9"},
  {key: "planet", label: "星球", symbol: "🪐", color: "#f1eafa"},
  {key: "star", label: "星星", symbol: "⭐", color: "#fff4d8"},
  {key: "book", label: "书本", symbol: "📚", color: "#e5f3f0"},
  {key: "flower", label: "小花", symbol: "🌼", color: "#f9e9ed"},
] as const;

export function isPresetAvatar(value: unknown): value is typeof ACCOUNT_AVATARS[number]["key"] {
  return ACCOUNT_AVATARS.some(avatar => avatar.key === value);
}
