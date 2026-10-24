import { describe, expect, it } from "vitest";
import { isSiteResourceQuery, routeTeachingRequest } from "./routing";

describe("teaching request routing", () => {
  it("routes a bare science-poem topic to the resource catalogue", () => {
    expect(routeTeachingRequest({message: "火焰诗"}).task).toBe("resources");
  });

  it("exports a completed parent activity recap without rewriting it", () => {
    const draft = "纸片活动中，幼儿先猜想再尝试。小磁铁由成人保管。";
    const route = routeTeachingRequest({message: "把这份活动回顾导出Word", state: {task: "document_analysis", query: "整理活动记录为家长回顾", draft}});
    expect(route.previousDraft).toBe(draft);
    expect(route.format).toBe("docx");
  });

  it.each(["科学实验", "科学故事"])("retains the previous topic when changing only the category to %s", category => {
    const route = routeTeachingRequest({message: `换成${category}`, state: {task: "resources", query: "推荐磁铁科学诗"}});
    expect(route.task).toBe("resources");
    expect(route.effectiveQuery).toContain("磁铁");
    expect(route.effectiveQuery).not.toContain("科学诗");
  });

  it("preserves age, semester and full text delivery when the science topic changes", () => {
    const route = routeTeachingRequest({message: "换成风的科学诗", state: {task: "resources", query: "推荐小班上册水的科学诗全文"}});
    expect(route.task).toBe("resources");
    expect(route.effectiveQuery).toMatch(/小班/u);
    expect(route.effectiveQuery).toMatch(/上册/u);
    expect(route.effectiveQuery).toMatch(/全文/u);
    expect(route.effectiveQuery).not.toMatch(/水/u);
  });

  it("keeps a school science-library request in the science catalogue", () => {
    expect(isSiteResourceQuery("国科二幼小班水的科学诗全文")).toBe(false);
    expect(isSiteResourceQuery("介绍国科二幼的办园理念")).toBe(true);
  });
  it("uses teaching resources for the existing lesson form's school template", () => {
    expect(isSiteResourceQuery("请按示例“温州市龙湾区国科温州第二幼儿园教育教学活动设计表”生成完整教案。主题：《玩转纸片》")).toBe(false);
  });
  it("keeps a named experiment video in the science library despite the school prefix", () => {
    expect(isSiteResourceQuery("找国科二幼《玩转纸片》的视频")).toBe(false);
  });
  it.each([
    ["生成中班磁铁完整教案并导出Word", undefined, "document_creation", "docx"],
    ["按上传的科学诗生成3:4封面", "document", "poetry_cover", undefined],
    ["给这幅科学作品鼓励反馈和探究任务", "image", "feedback", undefined],
    ["看看这张图", "image", "vision", undefined],
    ["分析上传教案并导出PDF", "document", "document_analysis", "pdf"],
    ["复盘今天失败的泡泡实验", undefined, "recap", undefined],
    ["帮我画一张磁铁实验配图", undefined, "illustration", undefined],
    ["找小班上册水的科学诗和配套视频", undefined, "resources", undefined],
    ["生成大班科学活动完整教案", undefined, "lesson", undefined],
    ["给我生成一个和火焰相关的科学实验", undefined, "lesson", undefined],
    ["做一个10页的PPT课件", undefined, "document_creation", "pptx"],
    ["《小水滴的旅行》的内容", undefined, "resources", undefined],
    ["介绍国科二幼的办园理念", undefined, "resources", undefined],
    ["请生成一张中班磁铁横版PPT封面科学插图", undefined, "illustration", undefined],
    ["根据上传图片生成横版PPT封面", "image", "illustration", undefined],
    ["根据上传活动记录制作封面", "document", "illustration", undefined],
    ["请分析上传图片，并生成一份观察报告。", "image", "vision", undefined],
    ["根据图片生成观察表并导出XLSX。", "image", "document_creation", "xlsx"],
    ["请提取 https://example.com/record.pdf 的正文，并用三句中文概括。", "document", "document_analysis", undefined],
    ["请提取 https://example.com/record.docx 的正文。", "document", "document_analysis", undefined],
    ["请生成完整教案，按字段包含活动内容、活动反思，不附加其他实验链接。", undefined, "lesson", undefined],
    ["请设计10页PPT课件，20分钟，不另加封面或附录。", undefined, "document_creation", "pptx"],
  ] as const)("routes %s", (message, attachmentType, task, format) => {
    expect(routeTeachingRequest({ message, attachmentType })).toMatchObject({task, format});
  });

  it("uses the previous completed draft when asked to export it", () => {
    const route = routeTeachingRequest({message: "把刚才的内容导出PDF", history: [
      {role: "user", content: "中班水的教案"},
      {role: "assistant", content: "# 水的秘密\n## 活动目标\n观察沉浮。"},
    ]});
    expect(route.task).toBe("document_creation");
    expect(route.previousDraft).toContain("观察沉浮");
    expect(route.effectiveQuery).toContain("中班水的教案");
  });

  it.each(["PDF", "Word", "PPTX", "XLSX"])("uses the confirmed draft after answering a format question with %s", message => {
    const route = routeTeachingRequest({message, state: {
      task: "document_creation", query: "请把中班空气课件导出一下", draft: "# 空气在哪里\n观察气球。",
    }});
    expect(route.previousDraft).toBe("# 空气在哪里\n观察气球。");
    expect(route.effectiveQuery).toContain("中班空气课件");
  });

  it("asks for a new export format even when the previous task produced a PPTX", () => {
    const route = routeTeachingRequest({message: "请把这份课件导出一下", state: {
      task: "document_creation", query: "制作中班空气PPT课件", format: "pptx", draft: "# 空气在哪里\n观察气球。",
    }});
    expect(route.format).toBeUndefined();
  });

  it("retains an unfinished creation request when the user selects its export format", () => {
    const route = routeTeachingRequest({message: "Word", state: {
      task: "document_creation", query: "制作中班空气活动课件并导出一下",
    }});
    expect(route.effectiveQuery).toContain("中班空气活动课件");
    expect(route.previousDraft).toBeUndefined();
  });

  it("does not export the previous draft when a new task is specified", () => {
    const route = routeTeachingRequest({message: "另外生成小班植物观察表XLSX", history: [
      {role: "assistant", content: "旧磁铁教案"},
    ]});
    expect(route.previousDraft).toBeUndefined();
    expect(route.format).toBe("xlsx");
  });

  it("routes a telephone question straight to a short answer", () => {
    expect(routeTeachingRequest({message:"为什么会下雨，给我完整教案",voiceCall:true}).task).toBe("voice");
    const callExport = routeTeachingRequest({message: "把刚才的教案导出Word", voiceCall: true,
      history: [{role: "assistant", content: "# 长篇教案"}]});
    expect(callExport.task).toBe("voice");
    expect(callExport.format).toBeUndefined();
    expect(callExport.previousDraft).toBeUndefined();
  });

  it("retains the named item through multiple short media follow-ups",()=>{
    const route=routeTeachingRequest({message:"它的全部步骤图",history:[
      {role:"user",content:"查找中班《会跳舞的纸片》实验"},
      {role:"assistant",content:"已找到会跳舞的纸片"},
      {role:"user",content:"它的视频呢"},
      {role:"assistant",content:"视频链接"},
    ]});
    expect(route.effectiveQuery).toContain("《会跳舞的纸片》");
    expect(route.task).toBe("resources");
  });
  it("replaces the previous age constraint when the user changes it",()=>{
    const route=routeTeachingRequest({message:"换成小班上册的科学诗",history:[{role:"user",content:"推荐中班下册磁铁科学诗"}]});
    expect(route.effectiveQuery).toContain("磁铁");
    expect(route.effectiveQuery).not.toContain("中班");
    expect(route.effectiveQuery).not.toContain("下册");
  });

  it("keeps a resource request when only its age and semester change", () => {
    const route = routeTeachingRequest({message: "换成小班上册", history: [
      {role: "user", content: "推荐中班下册磁铁科学诗"},
    ]});
    expect(route.task).toBe("resources");
    expect(route.effectiveQuery).toContain("磁铁");
    expect(route.effectiveQuery).not.toMatch(/中班|下册/u);
  });

  it("keeps lesson creation when only the target age changes", () => {
    expect(routeTeachingRequest({message: "换成小班", history: [
      {role: "user", content: "设计中班磁铁活动教案"},
    ]}).task).toBe("lesson");
  });

  it("replaces the previous media request rather than requiring both kinds", () => {
    const route = routeTeachingRequest({message: "它的全部步骤图", history: [
      {role: "user", content: "查找中班《会跳舞的纸片》实验的视频"},
    ]});
    expect(route.effectiveQuery).toContain("《会跳舞的纸片》");
    expect(route.effectiveQuery).toContain("步骤图");
    expect(route.effectiveQuery).not.toContain("视频");
  });

  it("replaces an explicitly changed experiment title before retrieving its media", () => {
    const route = routeTeachingRequest({message: "换成《会跳舞的纸片》的全部步骤图", state: {
      task: "resources", query: "找小班《生气的河豚》实验的全部步骤图", resourceIds: ["old-pufferfish"],
    }});
    expect(route.task).toBe("resources");
    expect(route.effectiveQuery).toContain("《会跳舞的纸片》");
    expect(route.effectiveQuery).not.toContain("生气的河豚");
    expect(route.effectiveQuery).toContain("小班");
  });

  it("regenerates a timed revision before exporting instead of reusing the old draft", () => {
    const route = routeTeachingRequest({message: "改为15分钟并导出PDF", history: [
      {role: "user", content: "设计中班磁铁活动教案，30分钟"},
      {role: "assistant", content: "# 磁铁活动\n活动时间：30分钟。"},
    ]});
    expect(route.previousDraft).toBeUndefined();
    expect(route.effectiveQuery).not.toContain("30分钟");
    expect(route.effectiveQuery).toContain("15分钟");
  });
});
