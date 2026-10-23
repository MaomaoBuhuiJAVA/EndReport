// Real HTTP/provider checks with synthetic, non-personal teaching material.
// Start a production server first. Add --images for the two image generation calls.
// Optional: --case=vision (one case), NATIVE_SMOKE_BASE=http://127.0.0.1:3100.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import {isGeneratedImageUrl} from "../src/lib/generated-image-url-core.mjs";

const base = process.env.NATIVE_SMOKE_BASE || "http://127.0.0.1:3100";
const output = join(process.cwd(), "tmp", "native-workflow-smoke");
const selected = process.argv.find(arg => arg.startsWith("--case="))?.slice(7);
const selectedCases = selected?.split(",");
const withImages = process.argv.includes("--images") || Boolean(selected);
const report = [];
const previousReport = selected ? JSON.parse(await readFile(join(output, "report.json"), "utf8").catch(() => "[]")) : [];
let lesson;
await mkdir(output, {recursive: true});
const drawing = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="white"/><circle cx="320" cy="300" r="100" fill="yellow" stroke="orange" stroke-width="8"/><path d="M100 550 Q320 430 540 550" fill="none" stroke="green" stroke-width="20"/></svg>')).png().toBuffer();

async function chat(id, body, {attachment, task, kind} = {}) {
  const started = performance.now();
  let requestBody;
  if (attachment) {
    requestBody = new FormData();
    for (const [key, value] of Object.entries(body)) requestBody.set(key, typeof value === "string" ? value : JSON.stringify(value));
    requestBody.set("attachment", attachment);
  } else requestBody = JSON.stringify(body);
  const response = await fetch(`${base}/api/ai-chat`, {
    method: "POST", body: requestBody, signal: AbortSignal.timeout(210_000),
    headers: attachment ? {} : {"Content-Type": "application/json"},
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  await writeFile(join(output, `${id}.json`), JSON.stringify(data, null, 2));
  const summary = {id, milliseconds: Math.round(performance.now() - started), provider: data.provider, task: data.workflowState?.task, kind: data.agentResult?.kind, characters: data.reply?.length, photos: data.photos?.length, files: data.files?.length};
  assert.equal(data.provider, "native");
  assert.ok(data.reply?.trim());
  assert.ok(!["error", "degraded"].includes(data.agentResult?.kind), data.agentResult?.message);
  if (task) assert.equal(data.workflowState?.task, task);
  if (kind) assert.equal(data.agentResult?.kind, kind);
  return {data, summary};
}

async function download(data, extension) {
  const file = data.files?.find(file => file.name.toLowerCase().endsWith(`.${extension}`));
  assert.ok(file, `Missing ${extension} file`);
  const url = new URL(file.url, base);
  assert.equal(url.origin, new URL(base).origin);
  assert.equal(url.pathname, "/api/ai-chat/artifact");
  const response = await fetch(url, {signal: AbortSignal.timeout(30_000)});
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-disposition")?.startsWith("attachment"));
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 100);
  if (extension === "pdf") assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  else {
    const zip = await JSZip.loadAsync(bytes);
    const entry = {docx: "word/document.xml", pptx: "ppt/presentation.xml", xlsx: "xl/workbook.xml"}[extension];
    assert.ok(zip.file(entry), `Invalid ${extension} structure`);
  }
  await writeFile(join(output, basename(file.name).replace(/[<>:"/\\|?*]/gu, "_")), bytes);
  return new File([bytes], file.name, {type: file.mimeType});
}

async function image(data, width, height) {
  const file = data.files?.find(file => file.type === "image");
  assert.ok(file);
  const url = new URL(file.url);
  assert.equal(url.protocol, "https:");
  assert.ok(isGeneratedImageUrl(url));
  const response = await fetch(url, {signal: AbortSignal.timeout(45_000)});
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  // The live Qwen service aligns nominal dimensions to its pixel grid.
  assert.ok(Math.abs(metadata.width - width) <= 8, `Unexpected image width: ${metadata.width}`);
  assert.ok(Math.abs(metadata.height - height) <= 8, `Unexpected image height: ${metadata.height}`);
  await writeFile(join(output, `${metadata.width}x${metadata.height}.png`), await sharp(bytes).png().toBuffer());
  return {width: metadata.width, height: metadata.height};
}

const cases = [
  ["lesson", async () => {
    const result = await chat("lesson", {message: "为小班设计10分钟《生气的河豚》科学实验教案，含目标、材料、3步流程和安全提示，正文简洁。"}, {task: "lesson"});
    lesson = result.data;
    return result.summary;
  }],
  ["resources", async () => {
    const result = await chat("resources", {message: "找《生气的河豚》的全部步骤图"}, {task: "resources"});
    assert.equal(result.data.photos.length, 5);
    assert.ok(result.data.sources.every(title => title === "生气的河豚"));
    const followup = await chat("resources-followup", {message: "它的视频呢", workflowState: result.data.workflowState}, {task: "resources"});
    assert.ok(followup.data.sources.every(title => title === "生气的河豚"));
    const changed = await chat("resources-changed", {message: "换成“玩转纸片”的全部步骤图", workflowState: result.data.workflowState}, {task: "resources"});
    assert.deepEqual(changed.data.sources, ["玩转纸片"]);
    assert.ok(changed.data.photos.length > 0);
    return {...result.summary, followupMilliseconds: followup.summary.milliseconds};
  }],
  ["site_resources", async () => {
    const reading = await chat("site-reading", {message: "找绘本阅读坊的照片"}, {task: "resources"});
    assert.deepEqual(reading.data.sources, ["绘本阅读坊"]);
    assert.equal(reading.data.photos.length, 1);
    assert.match(reading.data.photos[0].url, /room-08\.webp/u);
    assert.doesNotMatch(reading.data.reply, /seed|数据库/u);
    const photo = await fetch(new URL(reading.data.photos[0].url, base), {signal: AbortSignal.timeout(30_000)});
    assert.equal(photo.status, 200);
    assert.equal((await sharp(Buffer.from(await photo.arrayBuffer())).metadata()).format, "webp");
    const changed = await chat("site-changed", {message: "换成建构空间坊的照片", workflowState: reading.data.workflowState}, {task: "resources"});
    assert.deepEqual(changed.data.sources, ["建构空间坊"]);
    assert.equal(changed.data.photos.length, 1);
    assert.match(changed.data.photos[0].url, /room-04\.webp/u);
    const unknown = await chat("site-unknown", {message: "换成月球基地的照片", workflowState: reading.data.workflowState}, {task: "resources"});
    assert.deepEqual(unknown.data.photos, []);
    assert.deepEqual(unknown.data.sources, []);
    const profile = await chat("site-profile", {message: "介绍国科二幼的办园理念"}, {task: "resources"});
    assert.match(profile.data.reply, /筑可探之境，润向美童心/u);
    return {id: "site_resources", readingMilliseconds: reading.summary.milliseconds, profileMilliseconds: profile.summary.milliseconds};
  }],
  ["resource_text", async () => {
    const catalog = JSON.parse(await readFile(join(process.cwd(), "src", "data", "science-knowledge.json"), "utf8"));
    const water = await chat("resource-water", {message: "找国科二幼小班水的科学诗全文"}, {task: "resources"});
    assert.ok(water.data.sources.length > 0);
    for (const title of water.data.sources) assert.ok(catalog.some(item => item.title === title && item.category === "科学诗" && item.ageLabel === "小班" && item.topic.includes("水")));
    const poem = await chat("resource-poem-content", {message: "《春雨小精灵》的内容"}, {task: "resources"});
    assert.deepEqual(poem.data.sources, ["春雨小精灵"]);
    assert.ok(poem.data.reply.includes(catalog.find(item => item.title === "春雨小精灵").body));
    const video = await chat("resource-school-video", {message: "找国科二幼《玩转纸片》的视频"}, {task: "resources"});
    assert.deepEqual(video.data.sources, ["玩转纸片"]);
    assert.equal(video.data.photos.length, 0);
    assert.match(video.data.reply, /https:\/\/p1\.qr105\.cn/u);
    const changedTopic = await chat("resource-changed-topic", {message: "换成风的科学诗", workflowState: water.data.workflowState}, {task: "resources"});
    assert.ok(changedTopic.data.sources.length > 0);
    for (const title of changedTopic.data.sources) assert.ok(catalog.some(item => item.title === title && item.category === "科学诗" && item.ageLabel === "小班" && item.topic === "风"));
    return {id: "resource_text", milliseconds: water.summary.milliseconds};
  }],
  ["resource_guidance", async () => {
    const catalog = JSON.parse(await readFile(join(process.cwd(), "src", "data", "science-knowledge.json"), "utf8"));
    const result = await chat("resource-guidance", {message: "推荐一首适合小班的关于风的科学诗，并说明怎么带幼儿读。"}, {task: "resources"});
    assert.equal(result.data.sources.length, 1);
    const poem = catalog.find(item => item.title === result.data.sources[0] && item.category === "科学诗" && item.ageLabel === "小班" && item.topic === "风");
    assert.ok(poem);
    assert.ok(result.data.reply.includes(poem.body));
    assert.match(result.data.reply.split("### 带读建议").at(-1), /朗读|慢读|节奏|动作|摆|摇|观察/u);
    assert.equal(result.data.labLinks[0].id, poem.id);
    return result.summary;
  }],
  ["parent_recap", async () => {
    const record = new File(["活动记录《会跳舞的纸片》：教师请幼儿先猜想，再用纸片和磁铁试一试，观察到部分纸片移动。尚未记录全部条件，不能确定移动原因。安全提醒：小磁铁由成人保管，不放入口鼻。"], "synthetic-record.txt", {type: "text/plain"});
    const result = await chat("parent-recap", {message: "请将上传的活动记录整理为一则面向家长的活动回顾，200字以内，不补造观察结果。"}, {attachment: record, task: "document_analysis"});
    assert.match(result.data.reply, /纸片/u);
    assert.match(result.data.reply, /磁铁/u);
    assert.match(result.data.reply, /成人|老师|教师/u);
    assert.doesNotMatch(result.data.reply, /<think>|synthetic-record|诊断维度/iu);
    assert.equal(result.data.agentResult, undefined);
    assert.deepEqual(result.data.sources, []);
    assert.deepEqual(result.data.labLinks, []);
    assert.deepEqual(result.data.photos, []);
    const exported = await chat("parent-recap-word", {message: "把这份活动回顾导出Word", workflowState: result.data.workflowState}, {task: "document_creation"});
    assert.equal(exported.data.reply, result.data.reply);
    assert.deepEqual(exported.data.sources, []);
    assert.deepEqual(exported.data.labLinks, []);
    assert.deepEqual(exported.data.photos, []);
    const file = await download(exported.data, "docx");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    assert.match(await zip.file("word/document.xml").async("string"), /纸片/u);
    return {...result.summary, exportMilliseconds: exported.summary.milliseconds};
  }],
  ["format_clarification", async () => {
    const draft = "# 空气在哪里\n## 活动目标\n观察气球，比较空气流动。\n## 安全提示\n由成人保管未充气的气球。";
    const first = await chat("format-ask", {message: "请把这份课件导出一下", workflowState: {task: "document_creation", query: "制作中班空气PPT课件", format: "pptx", draft}}, {task: "document_creation"});
    assert.match(first.data.reply, /Word.*PDF.*PPTX.*XLSX/u);
    assert.equal(first.data.files.length, 0);
    assert.equal(first.data.workflowState.draft, draft);
    const second = await chat("format-selected", {message: "PDF", workflowState: first.data.workflowState}, {task: "document_creation"});
    assert.equal(second.data.reply, draft);
    assert.equal(second.data.files.length, 1);
    await download(second.data, "pdf");
    return {id: "format_clarification", askMilliseconds: first.summary.milliseconds, pdfMilliseconds: second.summary.milliseconds};
  }],
  ["url_document", async () => {
    const result = await chat("url-document", {message: "请提取 https://example.com/ 的真实正文，然后以“正文”和“三句概括”两个标题输出；三句概括每句一行，正好三句中文。"}, {task: "document_analysis"});
    assert.equal(result.data.attachment.status, "uploaded");
    assert.match(result.data.workflowState.evidenceText, /Example Domain/u);
    assert.ok(result.data.reply.includes(result.data.workflowState.evidenceText));
    assert.match(result.data.reply, /Example Domain/u);
    const summary = result.data.reply.split(/(?:#{1,6}\s*)?三句概括[^\n]*\n/u).at(-1);
    assert.equal(summary.match(/[。！？]/gu)?.length, 3);
    return result.summary;
  }],
  ["lesson_form", async () => {
    const message = "请按示例“温州市龙湾区国科温州第二幼儿园教育教学活动设计表”生成一份完整教案。主题：《玩转纸片》；班级（适用年龄段）：大班；活动时长：20分钟；输出格式：文字教案。只输出当前主题教案，不附加其他实验链接或推荐资源。按示例字段交付：主题、领域、班级、来源、教学活动、时间、教师、活动目标、重点难点、活动准备、活动内容、备注、活动反思。其中活动内容包含设计意图，以及导入猜想、分组操作、分享表达、总结延伸四个阶段，每阶段写清教师行为、幼儿可能回应和建议时长。";
    const result = await chat("lesson-form", {message}, {task: "lesson"});
    assert.deepEqual(result.data.sources, ["玩转纸片"]);
    for (const section of ["活动目标", "活动准备", "导入", "操作", "表达", "延伸"]) assert.ok(result.data.reply.includes(section));
    assert.doesNotMatch(result.data.reply, /<think>/iu);
    return result.summary;
  }],
  ["document_exports", async () => {
    lesson ||= JSON.parse(await readFile(join(output, "lesson.json"), "utf8"));
    const first = await chat("export-word", {message: "把刚才教案导出Word", workflowState: lesson.workflowState}, {task: "document_creation"});
    await download(first.data, "docx");
    const second = await chat("export-pdf", {message: "把刚才教案导出PDF", workflowState: lesson.workflowState}, {task: "document_creation"});
    const pdf = await download(second.data, "pdf");
    const roundtrip = await chat("pdf-roundtrip", {message: "请读取这份PDF，简短检查活动目标和安全提示。"}, {attachment: pdf, task: "document_analysis", kind: "document_diagnosis"});
    assert.match(roundtrip.data.workflowState.evidenceText, /生气的河豚/u);
    return {id: "document_exports", wordMilliseconds: first.summary.milliseconds, pdfMilliseconds: second.summary.milliseconds};
  }],
  ["document_analysis", async () => {
    const exported = JSON.parse(await readFile(join(output, "export-word.json"), "utf8"));
    const attachment = await download(exported, "docx");
    const result = await chat("document_analysis", {message: "请诊断上传的教案，重点检查小班适宜性和安全，给简短修订稿。"}, {attachment, task: "document_analysis", kind: "document_diagnosis"});
    assert.equal(result.data.attachment.status, "uploaded");
    return result.summary;
  }],
  ["document_creation", async () => {
    const result = await chat("document_creation", {message: "制作3页中班磁铁探究课件并导出PPTX，每页20字以内，分别介绍材料、操作、观察问题，以---分页。"}, {task: "document_creation"});
    await download(result.data, "pptx");
    const table = await chat("observation-table", {message: "制作磁铁观察记录表并导出XLSX，只有一张Markdown表格，列为对象、预测、结果，行是铁钉和木块，单元格简短。"}, {task: "document_creation"});
    await download(table.data, "xlsx");
    return {...result.summary, xlsxMilliseconds: table.summary.milliseconds};
  }],
  ["ten_page_ppt", async () => {
    const result = await chat("ten-page-ppt", {message: "请给中班空气在哪里设计10页PPT课件，20分钟。请严格输出10页，各页一个标题及不超过30字的正文，用---分隔页面，第一页也是活动内容，不另加封面或附录。"}, {task: "document_creation"});
    const file = await download(result.data, "pptx");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    assert.equal(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length, 10);
    assert.equal(result.data.files.length, 1);
    return result.summary;
  }],
  ["vision", async () => (await chat("vision", {message: "请分析图片，只列可见事实、证据缺口及一项教学建议，保持简短。"}, {attachment: new File([drawing], "synthetic-shapes.png", {type: "image/png"}), task: "vision", kind: "vision_observation"})).summary],
  ["recap", async () => (await chat("recap", {message: "复盘磁铁实验：铁钉被吸住，木块没有被吸住。请简短列出事实、待验证猜想、改进与验证点，不推断儿童能力。"}, {task: "recap", kind: "experiment_recap"})).summary],
  ["feedback", async () => (await chat("feedback", {message: "请对这幅合成的科学作品做简短反馈：我看见、我想知道、下次试试，不推断儿童身份或能力。"}, {attachment: new File([drawing], "synthetic-artwork.png", {type: "image/png"}), task: "feedback", kind: "work_feedback"})).summary],
  ["illustration", async () => {
    const result = await chat("illustration", {message: "请生成一张适合中班空气在哪里活动的横版PPT封面科学插图：气球和风，安全、明亮、无文字，无人物。"}, {task: "illustration"});
    assert.equal(result.data.workflowState.format, undefined);
    const dimensions = await image(result.data, 1664, 928);
    return {...result.summary, imageDimensions: dimensions};
  }],
  ["poetry_cover", async () => {
    const poem = new File(["科学诗《雨滴旅行》\n小雨滴，落下来，\n亲亲泥土和花儿。\n太阳暖，水汽升，\n变成白云再回来。"], "synthetic-poem.txt", {type: "text/plain"});
    const result = await chat("poetry_cover", {message: "根据上传科学诗生成3:4封面，以雨滴、水汽、白云表现水循环，柔和童趣，无文字，无人物。"}, {attachment: poem, task: "poetry_cover", kind: "poetry_cover"});
    const dimensions = await image(result.data, 1140, 1472);
    assert.match(result.data.workflowState.evidenceText, /小雨滴/u);
    return {...result.summary, imageDimensions: dimensions};
  }],
  ["voice", async () => {
    const started = performance.now();
    const response = await fetch(`${base}/api/ai-chat`, {method: "POST", headers: {"Content-Type": "application/json", accept: "text/event-stream"}, body: JSON.stringify({message: "为什么会下雨？用两句小朋友能懂的话回答。", voiceCall: true}), signal: AbortSignal.timeout(30_000)});
    assert.equal(response.status, 200);
    const decoder = new TextDecoder();
    let pending = "", text = "", final, firstDelta, firstSentence, tts;
    for await (const part of response.body) {
      pending += decoder.decode(part, {stream: true});
      const frames = pending.split("\n\n"); pending = frames.pop();
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const event = JSON.parse(frame.slice(6));
        if (event.type === "delta") {
          firstDelta ??= Math.round(performance.now() - started);
          text += event.delta;
          const sentence = text.match(/^.+?[。！？!?]/u)?.[0];
          if (sentence && !tts) {
            firstSentence = Math.round(performance.now() - started);
            tts = (async () => {
              const audioResponse = await fetch(`${base}/api/voice/tts`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text: sentence}), signal: AbortSignal.timeout(30_000)});
              assert.equal(audioResponse.status, 200);
              const bytes = Buffer.from(await audioResponse.arrayBuffer());
              assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
              assert.equal(bytes.subarray(8, 12).toString(), "WAVE");
              await writeFile(join(output, "voice-first-sentence.wav"), bytes);
              return Math.round(performance.now() - started);
            })().then(value => ({value}), error => ({error}));
          }
        }
        if (event.type === "done") final = event;
      }
    }
    assert.equal(final?.provider, "native");
    assert.ok(!["error", "degraded"].includes(final.agentResult?.kind));
    assert.ok(firstSentence !== undefined);
    const textDoneMilliseconds = Math.round(performance.now() - started);
    const audio = await tts;
    if (audio?.error) throw audio.error;
    return {id: "voice", firstDeltaMilliseconds: firstDelta, firstSentenceMilliseconds: firstSentence, textDoneMilliseconds, audioReadyMilliseconds: audio.value};
  }],
];

for (const [id, execute] of cases) {
  if (selectedCases ? !selectedCases.includes(id) : !withImages && ["illustration", "poetry_cover"].includes(id)) continue;
  try { const result = {ok: true, ...await execute(), id}; report.push(result); console.log(JSON.stringify(result)); }
  catch (error) { const result = {id, ok: false, error: error.message}; report.push(result); console.error(JSON.stringify(result)); }
  const merged = [...new Map([...previousReport, ...report].map(result => {
    const id = result.id.replace(/-/gu, "_");
    return [id, {...result, id}];
  })).values()];
  await writeFile(join(output, "report.json"), JSON.stringify(merged, null, 2));
}
if (!report.length) throw new Error("Unknown smoke case");
process.exitCode = report.some(result => !result.ok) ? 1 : 0;
