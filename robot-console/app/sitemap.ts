import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://guokeey.cn", changeFrequency: "weekly", priority: 1 },
    { url: "https://guokeey.cn/lab", changeFrequency: "weekly", priority: 0.9 },
    { url: "https://guokeey.cn/works", changeFrequency: "weekly", priority: 0.7 },
  ];
}
