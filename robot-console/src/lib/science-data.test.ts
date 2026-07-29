import { describe, expect, it } from "vitest";
import { mergeScienceKnowledgeSummaries } from "./science-data";
import type { ScienceKnowledgeSummary } from "./science-types";

function summary(id: string, title = id): ScienceKnowledgeSummary {
  return {
    id,
    baseId: id,
    semester: "2025学年",
    category: "科学诗",
    title,
    ageLabel: "小班",
    topic: "磁力",
    author: "国科二幼",
    excerpt: "摘要",
    tags: [],
    resourceTypes: [],
    resources: [],
  };
}

describe("mergeScienceKnowledgeSummaries", () => {
  it("keeps packaged IDs available while preserving database-only entries", () => {
    const packaged = [summary("POEM-new", "新目录资料"), summary("POEM-shared", "目录版本")];
    const database = [summary("POEM-shared", "数据库版本"), summary("legacy-1", "历史资料")];

    expect(mergeScienceKnowledgeSummaries(packaged, database)).toEqual([
      summary("POEM-new", "新目录资料"),
      summary("POEM-shared", "数据库版本"),
      summary("legacy-1", "历史资料"),
    ]);
  });
});
