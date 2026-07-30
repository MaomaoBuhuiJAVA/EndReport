import { describe, expect, it } from "vitest";
import { getDatabaseSearchKeywords, prioritizeQualificationChunks } from "./search";

describe("knowledge search qualification handling", () => {
  it("keeps database keyword fan-out bounded while retaining the report phrase", () => {
    const keywords = getDatabaseSearchKeywords("省二级评估报告");

    expect(keywords.length).toBeLessThanOrEqual(12);
    expect(keywords).toContain("省二级评估");
  });

  it("prioritizes qualification documents for qualification questions", () => {
    const chunks = [
      { document: { category: "COURSE" }, id: "course" },
      { document: { category: "QUALIFICATION" }, id: "report" },
    ];

    expect(prioritizeQualificationChunks("省二级评估报告", chunks).map((chunk) => chunk.id)).toEqual([
      "report",
      "course",
    ]);
  });
});
