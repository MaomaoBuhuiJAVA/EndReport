import { expect, it } from "vitest";
import { sanitizeTeachingState } from "./state";
import { routeTeachingRequest } from "./routing";

it("keeps the confirmed topic when older messages have left the history window", () => {
  const state = sanitizeTeachingState({task: "resources", query: "找中班《会跳舞的纸片》实验", resourceIds: ["EXP-A"]});
  const route = routeTeachingRequest({message: "它的视频呢", state});
  expect(route.task).toBe("resources");
  expect(route.effectiveQuery).toContain("《会跳舞的纸片》");
});

it("exports the actual completed draft rather than a structured card's short chat caption", () => {
  const state = sanitizeTeachingState({task: "document_analysis", query: "诊断上传教案", draft: "# 修订稿\n真实活动过程"});
  const route = routeTeachingRequest({message: "把刚才的教案导出Word", state, history: [{role: "assistant", content: "文档分析已完成。"}]});
  expect(route.previousDraft).toBe("# 修订稿\n真实活动过程");
});

it("keeps an uploaded-poem cover task during an aspect-ratio refinement", () => {
  const state = sanitizeTeachingState({task: "poetry_cover", query: "按上传科学诗生成封面", evidenceText: "小水滴，飞上天。"});
  expect(routeTeachingRequest({message: "改成1:1", state})).toMatchObject({task: "poetry_cover", followUp: true});
});

it("rejects malformed state and bounds data from the client", () => {
  expect(sanitizeTeachingState({task: "execute", query: "anything"})).toBeUndefined();
  expect(sanitizeTeachingState({task: "lesson", query: 42})).toBeUndefined();
  const state = sanitizeTeachingState({task: "lesson", query: "磁铁", draft: "a".repeat(60000), resourceIds: ["../outside", "EXP-A"]});
  expect(state?.draft?.length).toBeLessThanOrEqual(50000);
  expect(state?.resourceIds).toEqual(["EXP-A"]);
});
