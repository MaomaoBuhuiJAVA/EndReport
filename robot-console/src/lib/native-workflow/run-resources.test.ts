import { afterEach, expect, it, vi } from "vitest";
import { runTeachingWorkflow } from "./run";
import packaged from "@/data/science-knowledge.json";
import type { ScienceKnowledgeItem } from "@/lib/science-types";

// Replace only the general database search. The catalog route must keep its strict no-hit result.
vi.mock("@/lib/search", () => ({searchKnowledge: async () => ({
  chunks: [{title: "其他实验", content: "不相干的材料", document: {title: "其他实验"}}], photos: [],
})}));
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();});

it("does not substitute general search results for an unavailable named experiment video", async () => {
  for (const key of ["AI_TEXT_API_KEY", "DEEPSEEK_API_KEY", "QWEN_API_KEY", "DASHSCOPE_API_KEY", "QWEN_TTS_API_KEY"]) vi.stubEnv(key, "");
  const result = await runTeachingWorkflow({message: "它的视频呢", history: [
    {role: "user", content: "找《火星小汽车》实验"},
    {role: "assistant", content: "没有找到该实验。"},
  ]}, {catalog: []});
  expect(result.reply).toContain("暂未收录");
  expect(result.sources).toEqual([]);
  expect(result.agentResult).toBeUndefined();
});

it("uses the safe no-flame fallback for a broad fire-experiment query", async () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const result = await runTeachingWorkflow({message: "和火有关的科学实验"}, {catalog: []});
  expect(result.reply).toContain("不是现场燃烧实验");
  expect(result.reply).toContain("不使用真实火焰");
  expect(result.sources).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});

it("does not pass a dangerous catalog experiment to the model or return flame procedures", async () => {
  vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  const fireExperiment = packaged.find(item => item.title === "火焰掌") as unknown as ScienceKnowledgeItem | undefined;
  expect(fireExperiment).toBeDefined();
  const result = await runTeachingWorkflow({message: "给我生成一个和火焰相关的科学实验"}, {catalog: [fireExperiment!]});
  expect(result.workflowState?.task).toBe("lesson");
  expect(result.reply).toContain("不使用真实火焰");
  expect(result.reply).toContain("视频或图片");
  expect(result.reply).not.toContain("点燃蜡烛");
  expect(result.reply).not.toContain("教师演示");
  expect(result.sources).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["“玩转纸片”", "〈玩转纸片〉", "「玩转纸片」", '"玩转纸片"'])("retrieves the new experiment when a follow-up names %s", async title => {
  const catalog = packaged as unknown as ScienceKnowledgeItem[];
  const previous = catalog.find(item => item.title === "生气的河豚")!;
  const result = await runTeachingWorkflow({message: `换成${title}的全部步骤图`, workflowState: {
    task: "resources", query: "找《生气的河豚》的全部步骤图", resourceIds: [previous.id],
  }}, {catalog});
  expect(result.sources).toEqual(["玩转纸片"]);
  expect(result.photos?.length).toBeGreaterThan(0);
  expect(result.photos?.every(photo => photo.description?.startsWith("玩转纸片"))).toBe(true);
});

it.each([
  ["给我大厅的照片", "大厅", "/rooms/room-03.webp"],
  ["给我全景图", "全景图", "/rooms/room-01.webp"],
  ["找全景图2的照片", "全景图2", "/rooms/room-02.webp"],
  ["找纵深科学廊2的照片", "纵深科学廊2", "/rooms/room-07.webp"],
])("returns the real room photo for %s without requiring a school prefix", async (message, room, url) => {
  vi.stubEnv("DATABASE_URL", "");
  for (const key of ["QWEN_API_KEY", "DASHSCOPE_API_KEY", "QWEN_TTS_API_KEY"]) vi.stubEnv(key, "");
  const result = await runTeachingWorkflow({message}, {catalog: []});
  expect(result.workflowState?.task).toBe("resources");
  expect(result.sources).toEqual([room]);
  expect(result.photos?.map(photo => photo.url)).toEqual([url]);
});

it("includes the second corridor photo when all photos of an unnumbered room are requested", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const result = await runTeachingWorkflow({message: "找纵深科学廊的全部照片"}, {catalog: []});
  expect(result.photos?.map(photo => photo.url)).toEqual(["/rooms/room-06.webp", "/rooms/room-07.webp"]);
});
