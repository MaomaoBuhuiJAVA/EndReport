import { afterEach, describe, expect, it, vi } from "vitest";
import { runTeachingWorkflow } from "./run";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScienceKnowledgeItem } from "@/lib/science-types";
import teachingCatalog from "@/data/science-knowledge.json";
import JSZip from "jszip";
import { readTeachingArtifact } from "./artifacts";

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function textModel(content:string) {return Response.json({choices:[{message:{content}}]});}
describe("native teaching workflow",()=>{
  it("bounds voice history and excludes a previous document draft from a short call", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(textModel("小水滴聚在一起变重，就会落下来啦。"));
    vi.stubGlobal("fetch", fetcher);
    await runTeachingWorkflow({message: "那它为什么会掉下来？", voiceCall: true,
      history: Array.from({length: 12}, (_, index) => ({role: index % 2 ? "assistant" as const : "user" as const,
        content: index === 11 ? "我们刚才说的是云里的小水滴。" : "旧文档内容".repeat(3000)})),
      workflowState: {task: "lesson", query: "上轮教案主题", draft: "不应带入的长篇教案".repeat(1000)},
    }, {catalog: []});
    const messages = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).messages;
    expect(messages).toHaveLength(8);
    expect(messages.slice(1, -1).every((message: {content: string}) => message.content.length <= 800)).toBe(true);
    expect(JSON.stringify(messages)).toContain("云里的小水滴");
    expect(JSON.stringify(messages)).not.toContain("不应带入的长篇教案");
  });
  it.each(["generate", "export"])("uses the kindergarten form for %s lesson Word delivery", async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), "native-lesson-form-"));
    vi.stubEnv("AI_ARTIFACT_DIR", directory);
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    const draft = "# 纸片教案\n## 活动目标\n观察纸片。\n---\n## 活动准备\n彩纸。\n---\n## 活动内容\n### 一、导入猜想\n先猜想，再操作。\n## 活动反思\n课后填写。";
    const fetcher = vi.fn(async () => textModel(draft));
    vi.stubGlobal("fetch", fetcher);
    const query = "请按幼儿园教育教学活动设计表生成完整教案。主题：《纸片》；班级（适用年龄段）：中班；活动时长：20分钟；导出Word。";
    try {
      const result = await runTeachingWorkflow(mode === "generate" ? {message: query} : {
        message: "把刚才的教案导出Word", workflowState: {task: "lesson", query, draft},
      }, {catalog: []});
      expect(result.agentResult).toBeUndefined();
      expect(result.files).toHaveLength(1);
      const token = new URL(result.files![0].url, "http://localhost").searchParams.get("token")!;
      const file = await readTeachingArtifact(token);
      const zip = await JSZip.loadAsync(file!.bytes);
      const xml = await zip.file("word/document.xml")!.async("string");
      expect(xml).toContain("温州市龙湾区国科温州第二幼儿园教育教学活动设计表");
      expect(xml).toContain("<w:tbl>");
      expect(xml).toContain("中班");
      expect(xml).toContain("20分钟");
      expect(xml).toContain("先猜想，再操作。");
      expect(xml).not.toContain("w:pageBreakBefore");
      expect(fetcher).toHaveBeenCalledTimes(mode === "generate" ? 1 : 0);
    } finally {await rm(directory, {recursive: true, force: true});}
  });

  it("delivers teaching detail links on this site while preserving unrelated external links", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel("# 空气活动\n[实验详情](https://www.qyfck.icu/lab?item=EXP-air)\n[外部资料](https://example.com/lab?item=air)"));
    const result = await runTeachingWorkflow({message: "设计中班空气活动教案"}, {catalog: []});
    expect(result.reply).toContain("[实验详情](/lab?item=EXP-air)");
    expect(result.reply).toContain("https://example.com/lab?item=air");
    expect(result.workflowState?.draft).toBe(result.reply);
  });

  it("preserves original source links during an unchanged document extraction", async () => {
    const original = "活动资料：https://www.qyfck.icu/lab?item=EXP-air";
    vi.stubGlobal("fetch", () => {throw new Error("Extraction requires no model");});
    const result = await runTeachingWorkflow({message: "请提取上传文件的完整正文", attachment: new File([original], "记录.txt", {type: "text/plain"})}, {catalog: []});
    expect(result.reply).toContain(original);
  });
  it("honors an explicit name-removal request instead of copying the original source", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel("活动记录：幼儿观察纸片。"));
    const result = await runTeachingWorkflow({message: "继续提取这份正文，隐去幼儿姓名后返回", workflowState: {
      task: "document_analysis", query: "提取上传记录的正文", evidenceText: "活动记录：示例小明观察纸片。",
    }}, {catalog: []});
    expect(result.reply).not.toContain("示例小明");
    expect(result.reply).toContain("幼儿观察纸片");
  });

  it("retains the complete original source when the requested summary fails", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => {throw new Error("Summary service disconnected");});
    const result = await runTeachingWorkflow({message: "请提取上传文件的正文，并用三句中文概括", attachment: new File(["第一段真实文字。\n第二段真实文字。"], "记录.txt", {type: "text/plain"})}, {catalog: []});
    expect(result.reply).toContain("第一段真实文字。\n第二段真实文字。");
    expect(result.workflowState?.draft).toContain("第二段真实文字");
    expect(result.agentResult).toMatchObject({kind: "degraded", retry: true});
  });

  it("preserves the entire extracted page even when the model returns only a summary", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel("页面包含两段真实文字。它提供公开资料。教师可以核对原文。"));
    const result = await runTeachingWorkflow({message: "请提取 https://example.com/ 的正文，并用三句中文概括。"}, {catalog: [], remoteDocument: {
      resolve: async () => [{address: "93.184.215.14", family: 4}],
      request: async () => ({status: 200, headers: new Headers({"content-type": "text/html"}), bytes: Buffer.from("<title>Example Domain</title><main><p>第一段真实文字。</p><p>第二段真实文字。</p></main>")}),
    }});
    expect(result.reply).toContain("Example Domain");
    expect(result.reply).toContain(result.workflowState?.evidenceText);
    expect(result.reply).toContain("教师可以核对原文");
  });

  it("delivers a plain extraction without requiring any model call", async () => {
    const fetcher = vi.fn(() => {throw new Error("Plain extraction requires no model");});
    vi.stubGlobal("fetch", fetcher);
    const result = await runTeachingWorkflow({message: "请提取上传文件的完整正文", attachment: new File(["第一段真实文字。\n第二段真实文字。"], "记录.txt", {type: "text/plain"})}, {catalog: []});
    expect(result.reply).toContain("第一段真实文字。\n第二段真实文字。");
    expect(result.agentResult).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("exports a confirmed activity recap without a model call or unrelated resource enrichment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-recap-export-"));
    vi.stubEnv("AI_ARTIFACT_DIR", directory);
    const fetcher = vi.fn(() => {throw new Error("A confirmed draft export needs no model call");});
    vi.stubGlobal("fetch", fetcher);
    try {
      const draft = "纸片活动中，幼儿先猜想再尝试。小磁铁由成人保管。";
      const result = await runTeachingWorkflow({message: "把这份活动回顾导出Word", workflowState: {
        task: "document_analysis", query: "请将上传的活动记录整理为一则面向家长的活动回顾", draft,
      }}, {catalog: teachingCatalog as ScienceKnowledgeItem[]});
      expect(result.reply).toBe(draft);
      expect(result.sources).toEqual([]);
      expect(result.labLinks).toEqual([]);
      expect(result.photos).toEqual([]);
      expect(result.files?.[0].name).toMatch(/\.docx$/u);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {await rm(directory, {recursive: true, force: true});}
  });

  it("replaces a continued poem topic while preserving the requested age", async () => {
    const catalog = teachingCatalog as ScienceKnowledgeItem[];
    const first = await runTeachingWorkflow({message: "推荐小班水的科学诗"}, {catalog});
    const second = await runTeachingWorkflow({message: "换成风的科学诗", workflowState: first.workflowState}, {catalog});
    expect(second.sources?.length).toBeGreaterThan(0);
    for (const title of second.sources || []) {
      expect(catalog.some(item => item.title === title && item.topic === "风" && item.ageLabel === "小班")).toBe(true);
    }
  });

  it("adds requested reading guidance to an unchanged real poem with one model call", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    const poem: ScienceKnowledgeItem = {id: "wind-poem", baseId: "wind-base", title: "风儿来", category: "科学诗", ageLabel: "小班", semester: "小班上册", topic: "风", author: "", tags: ["风"], excerpt: "真实诗歌节选", body: "风儿轻轻吹，叶儿摇摇摆。", resources: [], resourceTypes: [], sourceFile: "教师资料", sourcePage: "1", allocationBasis: "", ingestStatus: "ready", duplicateOf: "", imageCount: 0, videoUrl: ""};
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.stringify(JSON.parse(String(init.body)).messages);
      return textModel(input.includes(poem.body) ? "慢读两遍，用摆手动作表现风吹。" : "没有得到真实诗歌。");
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await runTeachingWorkflow({message: "推荐一首适合小班的关于风的科学诗，并说明怎么带幼儿读。"}, {catalog: [poem]});
    expect(result.reply).toContain(poem.body);
    expect(result.reply).toContain("摆手动作");
    expect(result.sources).toEqual([poem.title]);
    expect(result.labLinks?.[0].id).toBe(poem.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not invent reading guidance when no requested poem matches", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await runTeachingWorkflow({message: "推荐小班风的科学诗，并说明怎么带幼儿读"}, {catalog: []});
    expect(result.reply).toContain("暂未收录");
    expect(result.sources).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads a URL's actual page before asking the model to analyse it", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const input = JSON.stringify(JSON.parse(String(init.body)).messages);
      const text = input.includes("幼儿观察云朵的变化") ? "# 页面正文\n幼儿观察云朵的变化。" : "缺少真实网页正文。";
      return textModel(text);
    });
    const result = await runTeachingWorkflow({message: "请提取 https://example.com/ 的正文，并用三句中文概括。"}, {catalog: [], remoteDocument: {
      resolve: async () => [{address: "93.184.215.14", family: 4}],
      request: async () => ({status: 200, headers: new Headers({"content-type": "text/html"}), bytes: Buffer.from("<html><main>幼儿观察云朵的变化。</main></html>")}),
    }});
    expect(result.agentResult).toBeUndefined();
    expect(result.reply).toContain("幼儿观察云朵的变化");
    expect(result.workflowState?.evidenceText).toContain("幼儿观察云朵的变化");
    expect(result.attachment?.status).toBe("uploaded");
  });

  it("delivers an uploaded activity record as a parent recap without requiring a diagnosis card", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel("今天我们观察了会跳舞的纸片。孩子们先猜想再尝试。小磁铁由成人保管。"));
    const result = await runTeachingWorkflow({message: "请将上传的活动记录整理为一则面向家长的活动回顾。", attachment: new File(["活动记录：会跳舞的纸片。安全提醒：小磁铁由成人保管。"], "记录.txt", {type: "text/plain"})}, {catalog: teachingCatalog as ScienceKnowledgeItem[]});
    expect(result.reply).toContain("小磁铁由成人保管");
    expect(result.agentResult).toBeUndefined();
    expect(result.workflowState?.draft).toBe(result.reply);
    expect(result.sources).toEqual([]);
    expect(result.labLinks).toEqual([]);
    expect(result.photos).toEqual([]);
  });

  it("allows a plain parent recap after a previous document diagnosis", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel("今天孩子们观察了纸片，先猜想再尝试。小磁铁由成人保管。"));
    const result = await runTeachingWorkflow({message: "把这份记录整理为面向家长的活动回顾", workflowState: {
      task: "document_analysis", query: "请诊断上传的活动记录", evidenceText: "活动记录：观察纸片。小磁铁由成人保管。", draft: "# 活动记录修订稿\n观察纸片。",
    }}, {catalog: []});
    expect(result.agentResult).toBeUndefined();
    expect(result.reply).toContain("小磁铁由成人保管");
  });

  it("retains visual evidence while asking for the export format", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "vision-key");
    vi.stubGlobal("fetch", async () => textModel("可见证据：蓝色水滴和云朵。"));
    const bytes = await sharp({create: {width: 10, height: 10, channels: 3, background: "blue"}}).png().toBuffer();
    const result = await runTeachingWorkflow({message: "根据图片设计小班教案并导出一下", attachment: new File([bytes], "科学作品.png", {type: "image/png"})}, {catalog: []});
    expect(result.reply).toMatch(/Word.*PDF/u);
    expect(result.workflowState?.evidenceText).toContain("蓝色水滴和云朵");
    expect(result.files).toEqual([]);
  });
  it("applies a requested revision after clarifying the format rather than exporting the old draft", async () => {
    const directory = await mkdtemp(join(tmpdir(), "native-format-followup-"));
    vi.stubEnv("AI_ARTIFACT_DIR", directory);
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const input = JSON.stringify(JSON.parse(String(init.body)).messages);
      return textModel(input.includes("小班") && input.includes("观察气球") ? "# 小班空气教案\n幼儿观察气球。" : "# 缺少已确认的活动需求");
    });
    try {
      const first = await runTeachingWorkflow({message: "把刚才的教案改成小班，再导出一下", workflowState: {
        task: "lesson", query: "设计中班空气教案", draft: "# 中班空气教案\n观察气球。",
      }}, {catalog: []});
      expect(first.files).toEqual([]);
      const second = await runTeachingWorkflow({message: "Word", workflowState: first.workflowState}, {catalog: []});
      expect(second.reply).toContain("小班空气教案");
      expect(second.files).toHaveLength(1);
      expect(second.files?.[0].name).toMatch(/\.docx$/u);
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });

  it("retrieves the requested room photo without a science fallback or model call", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubGlobal("fetch", () => {throw new Error("Room photo delivery needs no model call");});
    const result = await runTeachingWorkflow({message: "找绘本阅读坊的照片"}, {catalog: []});
    expect(result.photos?.map(photo => photo.url)).toEqual(["/rooms/room-08.webp"]);
    expect(result.sources).toEqual(["绘本阅读坊"]);
    expect(result.reply).not.toMatch(/seed|数据库/u);
    expect(result.agentResult).toBeUndefined();
  });

  it("uses real school profile evidence when answering a telephone question", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const input = JSON.stringify(body.messages);
      return textModel(input.includes("筑可探之境，润向美童心") ? "我们的理念是筑可探之境，润向美童心。" : "未收到园所资料。");
    });
    const result = await runTeachingWorkflow({message: "国科二幼的办园理念是什么", voiceCall: true}, {catalog: []});
    expect(result.reply).toContain("筑可探之境，润向美童心");
    expect(result.sources).toContain("龙湾区国科温州第二幼儿园");
  });

  it("asks for a missing export format without generating or replacing the confirmed draft", async () => {
    vi.stubGlobal("fetch", () => {throw new Error("The workflow must resolve the format first");});
    const draft = "# 空气在哪里\n## 活动目标\n幼儿观察气球。";
    const result = await runTeachingWorkflow({message: "请把这份课件导出一下", workflowState: {task: "document_creation", query: "制作中班空气课件", draft}}, {catalog: []});
    expect(result.files).toEqual([]);
    expect(result.reply).toMatch(/Word.*PDF.*PPTX.*XLSX/u);
    expect(result.workflowState?.draft).toBe(draft);
    expect(result.agentResult).toBeUndefined();
  });
  it("answers a greeting without touching an external service",async()=>{
    const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
    const result=await runTeachingWorkflow({message:"你好"},{catalog:[]});
    expect(result.provider).toBe("native");expect(result.reply).toContain("科小贝");expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns a recoverable configuration error instead of fabricated lesson content",async()=>{
    for(const key of ["AI_TEXT_API_KEY","DEEPSEEK_API_KEY","QWEN_API_KEY","DASHSCOPE_API_KEY","QWEN_TTS_API_KEY"])vi.stubEnv(key,"");
    const result=await runTeachingWorkflow({message:"生成磁铁完整教案"},{catalog:[]});
    expect(result.agentResult).toMatchObject({kind:"degraded",code:"model_unavailable",retry:true});
    expect(result.files).toEqual([]);
  });
  it("uses uploaded poem text when planning its cover, then invokes only one image generation",async()=>{
    vi.stubEnv("QWEN_TTS_API_KEY", "test-key");vi.stubEnv("QWEN_TTS_API_KEY", "test-image-key");
    const requests:Array<{url:string;body:Record<string,unknown>}>=[];
    vi.stubGlobal("fetch",async(url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body));requests.push({url,body});
      if(body.model?.startsWith("qwen-image"))return Response.json({output:{choices:[{message:{content:[{image:"https://dashscope-result.oss-cn-beijing.aliyuncs.com/a.png"}]}}]}});
      return textModel(JSON.stringify({title:"小水滴",age_group:"中班",aspect_ratio:"3:4",theme_keywords:["水滴"],alt_text:"小水滴",generation_prompt:"A little water droplet rising into a cloud, cartoon picture book"}));
    });
    const result=await runTeachingWorkflow({message:"根据上传科学诗生成封面",attachment:new File(["小水滴，飞上天，变成云朵看世界。"],"科学诗.txt",{type:"text/plain"})},{catalog:[]});
    expect(JSON.stringify(requests[0].body)).toContain("变成云朵看世界");
    expect(requests.filter(x=>String(x.body.model).startsWith("qwen-image"))).toHaveLength(1);
    expect(result.agentResult).toMatchObject({kind:"poetry_cover",title:"小水滴",aspect_ratio:"3:4"});
    expect(result.files).toHaveLength(1);
    expect(requests.every(x=>!x.url.includes("dify"))).toBe(true);
  });
  it("carries image evidence into work feedback instead of treating an image as plain text",async()=>{
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");vi.stubEnv("QWEN_TTS_API_KEY", "vision-key");
    const requests:Record<string,unknown>[]=[];
    vi.stubGlobal("fetch",async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(String(init.body));requests.push(body);
      if(String(body.model).includes("vl"))return textModel("可见证据：纸上画着蓝色水滴和云朵。");
      return textModel(JSON.stringify({kind:"work_feedback",encouragement:["你观察到了水滴。"],i_saw:["蓝色水滴和云朵"],i_wonder:["水滴去了哪里？"],next_try:["观察杯壁水滴"],tags:["水"],recommended_resources:[],privacy_visibility:"teacher_only"}));
    });
    // Valid one-pixel PNG, read by the actual attachment parser.
    const bytes=await sharp({create:{width:10,height:10,channels:3,background:"blue"}}).png().toBuffer();
    const result=await runTeachingWorkflow({message:"给这幅科学作品鼓励反馈",attachment:new File([bytes],"作品.png",{type:"image/png"})},{catalog:[]});
    expect(JSON.stringify(requests[0])).toContain("image_url");
    expect(JSON.stringify(requests[1])).toContain("蓝色水滴和云朵");
    expect(result.agentResult?.kind).toBe("work_feedback");
  });

  it("retains the uploaded poem and honors an explicit new ratio on a later cover", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");vi.stubEnv("QWEN_TTS_API_KEY", "image-key");
    const prompts: string[] = [], sizes: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.model?.startsWith("qwen-image")) {
        sizes.push(body.parameters.size);
        return Response.json({output: {choices: [{message: {content: [{image: "https://dashscope-result.oss-cn-beijing.aliyuncs.com/poem.png"}]}}]}});
      }
      prompts.push(JSON.stringify(body.messages));
      return textModel(JSON.stringify({title: "小水滴", aspect_ratio: "3:4", theme_keywords: ["水滴"], alt_text: "小水滴", generation_prompt: "A water droplet cartoon cover"}));
    });
    const first = await runTeachingWorkflow({message: "按上传科学诗生成封面", attachment: new File(["小水滴，飞上天，变成云朵看世界。"], "诗.txt", {type: "text/plain"})}, {catalog: []});
    const second = await runTeachingWorkflow({message: "改成1:1", workflowState: first.workflowState}, {catalog: []});
    expect(prompts[1]).toContain("变成云朵看世界");
    expect(sizes).toEqual(["1140*1472", "1328*1328"]);
    expect(second.agentResult).toMatchObject({kind: "poetry_cover", aspect_ratio: "1:1"});
  });

  it("removes unverified catalog recommendations from otherwise valid feedback", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel(JSON.stringify({kind: "work_feedback", encouragement: ["你画出了水滴。"], i_saw: ["蓝色水滴"], i_wonder: ["它从哪里来？"], next_try: ["观察杯壁"], tags: ["水"], recommended_resources: [{resource_id: "invented", title: "杜撰的园本实验"}], privacy_visibility: "teacher_only"})));
    const result = await runTeachingWorkflow({message: "作品是蓝色水滴，请给反馈"}, {catalog: []});
    expect(result.agentResult).toMatchObject({kind: "work_feedback", recommended_resources: []});
  });

  it("rejects a valid result for a different task", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    vi.stubGlobal("fetch", async () => textModel(JSON.stringify({kind: "work_feedback", encouragement: [], i_saw: [], i_wonder: [], next_try: [], tags: [], recommended_resources: [], privacy_visibility: "teacher_only"})));
    const result = await runTeachingWorkflow({message: "复盘今天的泡泡实验"}, {catalog: []});
    expect(result.agentResult).toMatchObject({kind: "degraded", code: "invalid_result"});
  });

  it("preserves text already delivered when a streaming model fails mid-answer", async () => {
    vi.stubEnv("QWEN_TTS_API_KEY", "text-key");
    let pulls = 0;
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream({pull(controller) {
      if (!pulls++) controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"磁铁能吸引铁钉。"}}]}\n\n'));
      else controller.error(new Error("upstream disconnected"));
    }}), {headers: {"content-type": "text/event-stream"}}));
    const events: string[] = [];
    const result = await runTeachingWorkflow({message: "解释磁铁的作用"}, {catalog: [], onEvent: event => {if (event.type === "delta") events.push(event.delta);}});
    expect(events).toEqual(["磁铁能吸引铁钉。"]);
    expect(result.reply).toBe("磁铁能吸引铁钉。");
    expect(result.agentResult).toMatchObject({kind: "degraded", code: "generation_failed"});
  });
});
