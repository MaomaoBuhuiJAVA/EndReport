import { describe, expect, it } from "vitest";
import {
  buildScienceLabLinks,
  findScienceSummaryFromSearch,
  scienceLabHrefForId,
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

  it("keeps only the exact science resource when a teacher asks for a named lesson plan", () => {
    expect(
      buildScienceLabLinks(
        [
          { id: "science-paper", documentId: "paper", title: "玩转纸片" },
          { id: "science-car", documentId: "car", title: "空气动力小汽车" },
        ],
        "生成《玩转纸片》完整教案",
      ),
    ).toEqual([{ id: "paper", title: "玩转纸片", href: "/lab?item=paper" }]);
  });

  it("uses the science document marker when a search chunk ID is not packaged", () => {
    expect(
      buildScienceLabLinks([
        {
          id: "database-chunk-17",
          documentId: "story-17",
          title: "小水滴的旅行",
          document: { title: "科小贝实验室：小水滴的旅行" },
        },
      ]),
    ).toEqual([{ id: "story-17", title: "小水滴的旅行", href: "/lab?item=story-17" }]);
  });

  it("rejects Dify knowledge-document UUIDs instead of creating a dead lab route", () => {
    expect(scienceLabHrefForId("cmj8f4q9x0001qz08k3d2v7na")).toBeNull();
    expect(scienceLabHrefForId("8f367498-36ed-4115-808e-231f1d907e2f")).toBeNull();
  });

  it("accepts only the catalog LAB/EXP/STORY/POEM ID shape and normalizes LAB markers", () => {
    expect(scienceLabHrefForId("EXP-05b2527c3c7a")).toBe("/lab?item=EXP-05b2527c3c7a");
    expect(scienceLabHrefForId("LAB:STORY-d854d6a8e89f")).toBe("/lab?item=STORY-d854d6a8e89f");
    expect(scienceLabHrefForId("lab:exp-05B2527C3C7A")).toBe("/lab?item=EXP-05b2527c3c7a");
    expect(scienceLabHrefForId("RESOURCE-05b2527c3c7a")).toBeNull();
  });
});
