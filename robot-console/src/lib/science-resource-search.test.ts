import { describe, expect, it } from "vitest";
import type { ScienceKnowledgeSummary } from "./science-types";
import { searchScienceSummaries } from "./science-data";

function summary(
  id: string,
  overrides: Partial<ScienceKnowledgeSummary> = {},
): ScienceKnowledgeSummary {
  return {
    id,
    baseId: id,
    semester: "2025学年",
    category: "科学诗",
    title: id,
    ageLabel: "小班",
    topic: "风",
    author: "国科二幼",
    excerpt: "风吹过树叶，树叶沙沙响。",
    tags: ["科学诗", "风", "小班"],
    resourceTypes: ["文档资源"],
    resources: [],
    ...overrides,
  };
}

describe("searchScienceSummaries", () => {
  const items = [
    summary("飞呀飞", { title: "飞呀飞" }),
    summary("风爷爷的玩具", { title: "风爷爷的玩具" }),
    summary("大班的风", { title: "大班的风", ageLabel: "大班", tags: ["科学诗", "风", "大班"] }),
    summary("小班的磁力", { title: "小班的磁力", topic: "磁力", tags: ["科学诗", "磁力", "小班"] }),
    summary("水油分离实验", {
      category: "科学实验",
      title: "水油分离实验",
      topic: "水与液体",
      tags: ["科学实验", "水与液体", "中班"],
      ageLabel: "中班",
      resourceTypes: ["教案资源", "图片资源", "视频资源"],
    }),
    summary("另一个中班视频实验", {
      category: "科学实验",
      title: "另一个中班视频实验",
      topic: "化学反应",
      tags: ["科学实验", "化学反应", "中班"],
      ageLabel: "中班",
      resourceTypes: ["教案资源", "视频资源"],
    }),
  ];

  it("prioritizes matching age, category, and topic for a natural-language query", () => {
    const results = searchScienceSummaries(items, "推荐一首适合小班的关于风的科学诗", 3);

    expect(results.map((item) => item.title)).toEqual(["飞呀飞", "风爷爷的玩具"]);
    expect(results.every((item) => item.ageLabel === "小班" && item.category === "科学诗")).toBe(true);
  });

  it("returns an exact quoted title before broader matches", () => {
    const results = searchScienceSummaries(items, "《飞呀飞》科学诗的正文是什么", 3);

    expect(results[0]?.title).toBe("飞呀飞");
  });

  it("filters resource type when a media request is explicit", () => {
    const results = searchScienceSummaries(items, "中班水油分离实验视频", 3);

    expect(results.map((item) => item.title)).toEqual(["水油分离实验"]);
  });
});
