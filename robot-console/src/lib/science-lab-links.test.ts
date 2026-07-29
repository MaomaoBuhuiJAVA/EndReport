import { describe, expect, it } from "vitest";
import {
  buildScienceLabLinks,
  findScienceSummaryFromSearch,
} from "./science-lab-links";

const summary = {
  id: "exp-1",
  baseId: "base-1",
  semester: "小班上册",
  category: "科学诗" as const,
  title: "水会跳舞",
  ageLabel: "3-4岁",
  topic: "水的张力",
  author: "国科二幼",
  excerpt: "观察水滴。",
  tags: ["水"],
  resourceTypes: [],
  resources: [],
};

describe("science lab links", () => {
  it("returns the first three unique packaged science items in rank order", () => {
    expect(
      buildScienceLabLinks([
        { id: "science-exp-1", documentId: "exp-1", title: "水会跳舞" },
        { id: "doc-99", documentId: "99", title: "园所概览" },
        { id: "science-exp-1", documentId: "exp-1", title: "水会跳舞" },
        { id: "science-exp-2", documentId: "exp-2", title: "空气在哪里" },
        { id: "science-exp-3", documentId: "exp-3", title: "影子朋友" },
        { id: "science-exp-4", documentId: "exp-4", title: "磁铁游戏" },
      ]),
    ).toEqual([
      { id: "exp-1", title: "水会跳舞", href: "/lab?item=exp-1" },
      { id: "exp-2", title: "空气在哪里", href: "/lab?item=exp-2" },
      { id: "exp-3", title: "影子朋友", href: "/lab?item=exp-3" },
    ]);
  });

  it("encodes links and resolves only known summaries from the item parameter", () => {
    expect(
      buildScienceLabLinks([
        { id: "science-a/b", documentId: "a/b", title: "编码实验" },
      ]),
    ).toEqual([{ id: "a/b", title: "编码实验", href: "/lab?item=a%2Fb" }]);
    expect(findScienceSummaryFromSearch("?item=exp-1", [summary])).toBe(summary);
    expect(findScienceSummaryFromSearch("?item=missing", [summary])).toBeNull();
    expect(findScienceSummaryFromSearch("", [summary])).toBeNull();
  });
});
