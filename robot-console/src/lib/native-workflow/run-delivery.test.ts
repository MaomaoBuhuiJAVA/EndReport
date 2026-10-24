import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTeachingWorkflow } from "./run";
import { extractAttachment } from "./attachments";
import { GET } from "@/../app/api/ai-chat/artifact/route";
import { readAiChatResponse } from "@/lib/ai-chat-stream";
import { buildAiChatDocumentDownloadUrl } from "@/lib/ai-chat-download";
import JSZip from "jszip";

let directory = "";
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "native-delivery-"));
  vi.stubEnv("AI_ARTIFACT_DIR", directory);
  vi.stubEnv("AI_ARTIFACT_SECRET", "native-test-signing-secret-at-least-32-characters");
  vi.stubEnv("QWEN_TTS_API_KEY", "test-text-key");
  vi.stubGlobal("location", {origin: "http://localhost"});
});
afterEach(async () => {vi.unstubAllEnvs();vi.unstubAllGlobals();await rm(directory, {recursive: true, force: true});});

const draft = "# 磁铁探究\n## 活动目标\n观察磁铁吸引铁钉。\n\n| 观察对象 | 结果 |\n| --- | --- |\n| 铁钉 | 被吸引 |\n| 木块 | 没被吸引 |";

it.each(["Word", "PDF", "PPTX", "XLSX"])("delivers a real %s file through the browser response and signed download contract", async format => {
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: draft}}]}));
  const workflow = await runTeachingWorkflow({message: `生成磁铁观察材料并导出${format}`}, {catalog: []});
  const result = await readAiChatResponse(Response.json(workflow));
  expect(result.workflowState?.draft).toBe(draft);
  const file = result.files?.[0];
  expect(file).toBeDefined();
  const url = buildAiChatDocumentDownloadUrl(file!);
  expect(url).toMatch(/^\/api\/ai-chat\/artifact\?token=/u);
  const download = await GET(new Request(`http://localhost${url}`));
  expect(download.status).toBe(200);
  const content = await extractAttachment(new File([await download.arrayBuffer()], file!.name, {type: file!.mimeType}));
  expect(content.text).toContain("铁钉");
  expect(content.text).toContain("木块");
});

it("delivers exactly the requested ten PPT slides despite an extra model topic-title page", async () => {
  const paragraphs = Array.from({length: 10}, (_, index) => `安全观察${index + 1}`);
  const modelDraft = ["空气在哪里？", ...paragraphs].join("\n---\n");
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: modelDraft}}]}));
  const result = await runTeachingWorkflow({message: "中班空气在哪里设计10页PPT，不另加封面"}, {catalog: []});
  expect(result.workflowState?.draft).toBe(modelDraft);
  expect(result.files).toHaveLength(1);
  const download = await GET(new Request(`http://localhost${result.files![0].url}`));
  const zip = await JSZip.loadAsync(await download.arrayBuffer());
  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name));
  expect(slides).toHaveLength(10);
  const content = (await Promise.all(slides.map(name => zip.file(name)!.async("string")))).join("");
  for (const paragraph of paragraphs) expect(content).toContain(paragraph);
});

it("keeps the entire model draft and reports a page-count mismatch without a misleading PPT download", async () => {
  const modelDraft = Array.from({length: 5}, (_, index) => `# 观察${index + 1}\n真实观察记录${index + 1}`).join("\n---\n");
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: modelDraft}}]}));
  const result = await runTeachingWorkflow({message: "制作4页空气观察PPT"}, {catalog: []});
  expect(result.files).toEqual([]);
  expect(result.workflowState?.draft).toBe(modelDraft);
  expect(result.reply).toBe(modelDraft);
  expect(result.agentResult?.kind).toBe("degraded");
  expect(result.agentResult && "message" in result.agentResult ? result.agentResult.message : "").toMatch(/页数/u);
});

it.each([
  ["制作2页空气观察PPT，需要独立封面", "空气观察"],
  ["制作2页空气观察PPT，封面单独一页", "空气观察"],
  ["制作2页空气观察PPT，不另加封面", "安全须知"],
])("preserves a requested cover or unrelated first page and refuses an incorrect download: %s", async (message, heading) => {
  const modelDraft = `# ${heading}\n---\n# 观察空气\n观察气球中的空气。\n---\n# 分享发现\n说出自己的观察结果。`;
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: modelDraft}}]}));
  const result = await runTeachingWorkflow({message}, {catalog: []});
  expect(result.files).toEqual([]);
  expect(result.workflowState?.draft).toBe(modelDraft);
  expect(result.reply).toBe(modelDraft);
  expect(result.agentResult?.kind).toBe("degraded");
  expect(result.agentResult && "message" in result.agentResult ? result.agentResult.message : "").toMatch(/页数/u);
  expect(await readdir(directory)).toEqual([]);
});

it("grounds an extra topic title in the requested topic even when another phrase is quoted", async () => {
  const modelDraft = "# 空气在哪里\n---\n# 观察空气\n观察气球中的空气。\n---\n# 分享发现\n说出自己的观察结果。安全第一。";
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: modelDraft}}]}));
  const result = await runTeachingWorkflow({message: "制作中班空气在哪里2页PPT，不另加封面，最后加一句“安全第一”"}, {catalog: []});
  expect(result.files).toHaveLength(1);
  const download = await GET(new Request(`http://localhost${result.files![0].url}`));
  const zip = await JSZip.loadAsync(await download.arrayBuffer());
  const slides = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name));
  expect(slides).toHaveLength(2);
  const text = (await Promise.all(slides.map(name => zip.file(name)!.async("string")))).join("");
  expect(text).toContain("空气在哪里");
  expect(text).toContain("安全第一");
});

it("does not mistake a quoted closing phrase for the requested topic title", async () => {
  const modelDraft = "# 安全第一\n---\n# 观察空气\n观察气球中的空气。\n---\n# 分享发现\n说出自己的观察结果。";
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: modelDraft}}]}));
  const result = await runTeachingWorkflow({message: "制作中班空气在哪里2页PPT，不另加封面，最后加一句“安全第一”"}, {catalog: []});
  expect(result.files).toEqual([]);
  expect(result.workflowState?.draft).toBe(modelDraft);
  expect(result.agentResult && "message" in result.agentResult ? result.agentResult.message : "").toMatch(/页数/u);
});

it("exports the detailed recap from conversation state without making another model request", async () => {
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: JSON.stringify({kind: "experiment_recap", facts: ["气球没有鼓起"], speculations: ["接口可能漏气，尚未验证"], goal_analysis: ["观察气体产生"], issues: {materials: [], steps: ["需检查接口"], questions: [], organization: []}, improvements: ["检查气密性"], validation_points: ["同样材料下比较密封前后"], safety: ["请教师操作"]})}}]}));
  const recap = await runTeachingWorkflow({message: "复盘白醋和小苏打实验，气球没有鼓起"}, {catalog: []});
  vi.stubGlobal("fetch", () => {throw new Error("Export must reuse the confirmed content");});
  const exported = await runTeachingWorkflow({message: "把刚才复盘导出Word", workflowState: recap.workflowState}, {catalog: []});
  expect(exported.agentResult).toBeUndefined();
  expect(exported.reply).toContain("## 下一次验证点");
  const file = exported.files![0];
  const download = await GET(new Request(`http://localhost${file.url}`));
  const text = await extractAttachment(new File([await download.arrayBuffer()], file.name, {type: file.mimeType}));
  expect(text.text).toContain("同样材料下比较密封前后");
  expect(text.text).not.toContain('"kind"');
});

it("exports a generated lesson with current site detail links without another model request", async () => {
  vi.stubGlobal("fetch", async () => Response.json({choices: [{message: {content: "# 空气活动\n[实验详情](https://www.qyfck.icu/lab?item=EXP-air)"}}]}));
  const lesson = await runTeachingWorkflow({message: "设计中班空气活动教案"}, {catalog: []});
  vi.stubGlobal("fetch", () => {throw new Error("A confirmed lesson export needs no model call");});
  const result = await runTeachingWorkflow({message: "把这份教案导出Word", workflowState: lesson.workflowState}, {catalog: []});
  expect(result.reply).toContain("[实验详情](/lab?item=EXP-air)");
  const file = result.files![0];
  const download = await GET(new Request(`http://localhost${file.url}`));
  const extracted = await extractAttachment(new File([await download.arrayBuffer()], file.name, {type: file.mimeType}));
  expect(extracted.text).toContain("/lab?item=EXP-air");
  expect(extracted.text).not.toContain("qyfck.icu");
});

it("keeps source links intact through repeated exports of an extracted document", async () => {
  vi.stubGlobal("fetch", () => {throw new Error("An unchanged source export needs no model call");});
  const original = "活动资料：https://www.qyfck.icu/lab?item=EXP-air";
  let result = await runTeachingWorkflow({message: "请提取上传文件的完整正文", attachment: new File([original], "记录.txt", {type: "text/plain"})}, {catalog: []});
  for (const format of ["Word", "PPTX"]) {
    result = await runTeachingWorkflow({message: `把这份文档导出${format}`, workflowState: result.workflowState}, {catalog: []});
    expect(result.reply).toContain(original);
    expect(result.workflowState?.draft).toContain(original);
    const file = result.files![0];
    const download = await GET(new Request(`http://localhost${file.url}`));
    const extracted = await extractAttachment(new File([await download.arrayBuffer()], file.name, {type: file.mimeType}));
    expect(extracted.text.replace(/\s/gu, "")).toContain(original);
  }
});
