import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildLessonPlanDocx } from "./lesson-plan-docx";

describe("buildLessonPlanDocx", () => {
  it("keeps unmarked Chinese stage headings in the same continuation row as their first instruction", async () => {
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("水果", "小班", "20分钟", [
      "## 活动内容", "前一阶段观察记录。".repeat(20), "（二）果农大冒险", "幼儿依次走过独木桥。",
      "设计意图：", "提高平衡能力。", "后续过程记录。".repeat(40),
    ].join("\n")));
    const xml = await archive.file("word/document.xml")!.async("string");
    const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/gu)!;
    const stage = rows.find((row) => row.includes("（二）果农大冒险"))!;
    expect(stage).toContain("幼儿依次走过独木桥。");
    const heading = stage.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*?（二）果农大冒险(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/u)![0];
    expect(heading).toContain("<w:keepNext/>");
  });

  it("lets long form rows continue across pages while keeping stage headings with their text", async () => {
    const content = ["## 活动目标", "愿意尝试。", "## 活动准备", "纸片。", "## 活动内容",
      "### 一、导入猜想（5分钟）", "教师引导幼儿观察纸片并交流。".repeat(180),
      "### 二、分组操作（10分钟）", "幼儿比较操作结果。", "## 活动反思", "调整材料。".repeat(100)].join("\n");
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("纸片", "中班", "20分钟", content));
    const xml = await archive.file("word/document.xml")!.async("string");
    const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/gu)!;
    expect(rows.length).toBeGreaterThan(6);
    expect(rows[0]).toContain("<w:cantSplit/>");
    for (const row of [rows[2], rows[3], rows.at(-1)]) expect(row).not.toContain("<w:cantSplit/>");
    const activityRows = rows.slice(4, -1);
    for (const row of activityRows) expect(row).toContain("<w:cantSplit/>");
    const paragraphs = activityRows.join("").match(/<w:p>[\s\S]*?<\/w:p>/gu)!;
    const heading = paragraphs.find((p) => p.includes("一、导入猜想"));
    expect(heading).toContain("<w:keepNext/>");
    expect(heading).not.toContain("###");
    const body = paragraphs.find((p) => p.includes("教师引导幼儿观察纸片并交流。"));
    expect(body).toContain("<w:widowControl/>");
    expect(body).not.toContain("<w:keepNext/>");
    expect(body).not.toContain("<w:keepLines/>");
    expect(xml).toContain('<w:snapToGrid w:val="0"/>');
    expect(xml).not.toContain("w:pageBreakBefore");
    expect(xml.match(/教师引导幼儿观察纸片并交流。/gu)).toHaveLength(180);
  });

  it("preserves standalone metadata headings and observation table cells", async () => {
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("水果", "小班", "20分钟", [
      "## 领域", "健康", "## 来源", "园本原创资料", "## 教学活动", "寻找水果",
      "## 活动目标", "愿意尝试。", "## 活动内容", "观察记录：",
      "| 对象 | 预测 | 结果 |", "| --- | --- | --- |", "| 铁钉 | 会吸住 | 已吸住 |", "| 木块 | 不吸住 | 未吸住 |",
    ].join("\n")));
    const xml = await archive.file("word/document.xml")!.async("string");
    for (const value of ["健康", "园本原创资料", "寻找水果", "铁钉", "已吸住", "木块", "未吸住"]) expect(xml).toContain(value);
  });

  it("retains every column of an activity table even when one header matches a lesson field", async () => {
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("磁铁", "中班", "20分钟", [
      "## 活动过程", "| 时间 | 活动内容 | 教师提问 | 幼儿反应 |", "| --- | --- | --- | --- |",
      "| 5分钟 | 比较木块和铁钉 | 为什么木块没有吸住 | 幼儿说木块不吸住 |",
      "| 10分钟 | 分类尝试 | 哪些物体能吸住 | 幼儿说铁钉能吸住 |",
    ].join("\n")));
    const xml = await archive.file("word/document.xml")!.async("string");
    for (const text of ["教师提问", "幼儿反应", "5分钟", "比较木块和铁钉", "为什么木块没有吸住", "幼儿说木块不吸住", "10分钟", "哪些物体能吸住"])
      expect(xml).toContain(text);
  });

  it("keeps substantive lesson prefaces while omitting duplicate titles and metadata", async () => {
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("磁铁", "中班", "20分钟", [
      "# 《磁铁》完整教案", "主题：磁铁", "班级：中班", "教师：待填写",
      "## 设计依据", "幼儿已经比较过木块与铁钉。", "## 活动过程", "比较哪些材料能被吸住。",
    ].join("\n")));
    const xml = await archive.file("word/document.xml")!.async("string");
    expect(xml).toContain("设计依据");
    expect(xml).toContain("幼儿已经比较过木块与铁钉。");
    expect(xml).not.toContain("完整教案");
    expect(xml).not.toContain("教师：待填写");
  });

  it("maps bold field labels and unmarked section headings without losing metadata or printing separators", async () => {
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("吃得香", "小四班", "25分钟", [
      "**领域**：健康", "**来源**：网络资源", "**教学活动**：果农大冒险",
      "一、活动目标", "愿意参加游戏。", "---", "二、活动准备", "水果卡片。",
      "三、活动内容", "### 设计意图", "锻炼平衡能力。", "<!-- pagebreak -->", "### 采摘水果", "幼儿按序参与。",
    ].join("\n")));
    const xml = await archive.file("word/document.xml")!.async("string");
    const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/gu)!;
    expect(rows[0]).toContain("健康");
    expect(rows[0]).toContain("网络资源");
    expect(rows[1]).toContain("果农大冒险");
    expect(rows[2]).toContain("愿意参加游戏。");
    expect(rows[3]).toContain("水果卡片。");
    expect(rows[4]).toContain("锻炼平衡能力。");
    expect(xml).not.toContain("pagebreak");
    expect(xml).not.toContain(">---<");
  });

  it("keeps standalone teacher labels and short responses intact at a page boundary", async () => {
    const archive = await JSZip.loadAsync(await buildLessonPlanDocx("纸片", "中班", "20分钟", [
      "## 活动内容", "### 一、导入猜想", "- **教师行为**：", "1. 请幼儿比较纸片。",
      "- **幼儿可能回应**：", "- 它变小了！", "长段观察记录。".repeat(80),
    ].join("\n")));
    const xml = await archive.file("word/document.xml")!.async("string");
    const paragraphs = xml.match(/<w:p>[\s\S]*?<\/w:p>/gu)!;
    for (const label of ["一、导入猜想", "教师行为", "幼儿可能回应"]) {
      const p = paragraphs.find((value) => value.includes(label));
      expect(p).toContain("<w:keepNext/>");
      expect(p).toContain("<w:keepLines/>");
    }
    expect(paragraphs.find((p) => p.includes("它变小了"))).toContain("<w:keepLines/>");
    expect(paragraphs.find((p) => p.includes("长段观察记录"))).not.toContain("<w:keepLines/>");
  });

  it("builds an A4 lesson-plan Word document from common Markdown sections", async () => {
    const bytes = await buildLessonPlanDocx(
      "玩转纸片",
      "中班",
      "30分钟",
      [
        "## 活动目标",
        "1. 能观察纸片折叠后的变化。",
        "2. 愿意用自己的语言分享发现。",
        "## 活动准备",
        "彩纸、剪刀和记录卡。",
        "## 活动过程",
        "1. 幼儿自由折叠纸片并比较形状。",
        "2. 教师引导幼儿记录不同折法。",
        "## 备注",
        "注意安全。",
        "## 活动反思",
        "下次可增加同伴展示环节。",
      ].join("\n"),
    );

    expect(bytes).toBeInstanceOf(Uint8Array);
    const archive = await JSZip.loadAsync(bytes);
    expect(Object.keys(archive.files)).toEqual(expect.arrayContaining([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/_rels/document.xml.rels",
      "word/styles.xml",
      "word/settings.xml",
    ]));

    const documentXml = await archive.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("温州市龙湾区国科温州第二幼儿园教育教学活动设计表");
    expect(documentXml).toContain('<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>');
    expect(documentXml).toContain('<w:docGrid w:linePitch="312"/>');
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain('<w:gridCol w:w="1332"/>');
    expect(documentXml).toContain('<w:gridCol w:w="1647"/>');
    expect(documentXml).toContain('<w:gridCol w:w="1467"/>');
    expect(documentXml).toContain('w:ascii="黑体"');
    expect(documentXml).toContain('w:ascii="宋体"');
    expect(documentXml).toContain(">活 动</w:t>");
    expect(documentXml).toContain(">目 标</w:t>");
    expect(documentXml).toContain(">重</w:t>");
    expect(documentXml).toContain(">难点</w:t>");
    expect(documentXml).toContain(">活</w:t>");
    expect(documentXml).toContain(">动</w:t>");
    expect(documentXml).toContain(">内</w:t>");
    expect(documentXml).toContain(">容</w:t>");

    const topicLabelStart = documentXml?.indexOf(">主题</w:t>") ?? -1;
    const topicValueStart = documentXml?.indexOf(">玩转纸片</w:t>", topicLabelStart) ?? -1;
    expect(documentXml?.slice(topicLabelStart, topicValueStart)).toContain('w:ascii="宋体"');
    expect(documentXml?.slice(topicLabelStart, topicValueStart)).toContain('<w:jc w:val="center"/>');

    const noteStart = documentXml?.indexOf(">备注:</w:t>") ?? -1;
    const noteBodyStart = documentXml?.indexOf(">注意安全。</w:t>", noteStart) ?? -1;
    expect(noteStart).toBeGreaterThan(-1);
    expect(noteBodyStart).toBeGreaterThan(noteStart);
    expect(documentXml?.slice(noteStart, noteBodyStart)).not.toContain("<w:b");

    const noteBodyParagraph = documentXml?.match(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:t>注意安全。<\/w:t>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/u)?.[0];
    expect(noteBodyParagraph).toBeDefined();
    expect(noteBodyParagraph).not.toContain("<w:b");

    for (const field of [
      "主题",
      "领域",
      "班级",
      "来源",
      "教学活动",
      "时间",
      "教师",
      "活 动",
      "目 标",
      "重",
      "难点",
      "准 备",
      "活",
      "动",
      "内",
      "容",
      "备注",
      "反",
      "思",
    ]) {
      expect(documentXml).toContain(`>${field === "备注" ? "备注:" : field}</w:t>`);
    }

    for (const content of [
      "玩转纸片",
      "中班",
      "30分钟",
      "能观察纸片折叠后的变化。",
      "彩纸、剪刀和记录卡。",
      "幼儿自由折叠纸片并比较形状。",
      "下次可增加同伴展示环节。",
    ]) {
      expect(documentXml).toContain(content);
    }

    const teacherLabelEnd = documentXml?.indexOf(">教师</w:t>");
    const nextFieldStart = documentXml?.indexOf(">活 动</w:t>", teacherLabelEnd);
    const teacherValueXml = documentXml?.slice(
      (teacherLabelEnd ?? -1) + ">教师</w:t>".length,
      nextFieldStart,
    );
    expect(teacherValueXml).not.toMatch(/<w:t(?: [^>]*)?>[^<]+<\/w:t>/u);
    expect(documentXml).not.toContain("## 活动目标");
    expect(documentXml).not.toContain("张老师");
  });

  it("places numbered generated lesson sections into their matching template cells", async () => {
    const bytes = await buildLessonPlanDocx(
      "玩转纸片",
      "大班",
      "30 分钟",
      [
        "## 《玩转纸片》完整教案",
        "### 一、活动目标",
        "能够比较不同折法带来的纸片变化。",
        "### 二、活动准备",
        "彩纸、吸管和记录卡。",
        "### 三、活动过程",
        "1. 幼儿先观察纸片，再动手折叠并记录。",
        "### 四、活动提示",
        "教师提醒幼儿安全使用材料。",
        "### 备课表字段",
        "| 字段 | 内容 |",
        "| --- | --- |",
        "| 主题 | 玩转纸片 |",
      ].join("\n"),
    );
    const archive = await JSZip.loadAsync(bytes);
    const documentXml = await archive.file("word/document.xml")?.async("string");

    const goalStart = documentXml?.indexOf(">目 标</w:t>") ?? -1;
    const keyPointStart = documentXml?.indexOf(">重</w:t>", goalStart) ?? -1;
    const preparationStart = documentXml?.indexOf(">准 备</w:t>", keyPointStart) ?? -1;
    const activityStart = documentXml?.indexOf(">内</w:t>", preparationStart) ?? -1;
    const notesStart = documentXml?.indexOf(">备注:</w:t>", activityStart) ?? -1;

    expect(documentXml?.slice(goalStart, keyPointStart)).toContain("能够比较不同折法带来的纸片变化。");
    expect(documentXml?.slice(preparationStart, activityStart)).toContain("彩纸、吸管和记录卡。");
    expect(documentXml?.slice(activityStart, notesStart)).toContain("幼儿先观察纸片，再动手折叠并记录。");
    expect(documentXml?.slice(activityStart, notesStart)).not.toContain("能够比较不同折法带来的纸片变化。");
    expect(documentXml).not.toContain("备课表字段");
    expect(documentXml?.match(/幼儿先观察纸片，再动手折叠并记录。/gu)?.length).toBe(1);
  });

  it("maps the reference field table from a model reply into the template cells", async () => {
    const bytes = await buildLessonPlanDocx(
      "玩转纸片",
      "大班",
      "30 分钟",
      [
        "| 主题 | 领域 | 班级 | 来源 |",
        "| --- | --- | --- | --- |",
        "| 玩转纸片 | 科学 | 大班 | 园本资料库 |",
        "| 教学活动 | 时间 | 教师 | 活动目标 |",
        "| 玩转纸片 | 30 分钟 | 待填写 | 观察纸片在不同操作中的变化。 |",
        "| 重点难点 | 活动准备 | 活动内容 | 备注 |",
        "| 比较纸片变化 | 彩纸、吸管 | 先猜想，再折叠、吹动并交流。 | 注意剪刀使用安全。 |",
        "| 活动反思 |  |  |  |",
        "| 根据幼儿表现调整材料。 |  |  |  |",
      ].join("\n"),
    );
    const archive = await JSZip.loadAsync(bytes);
    const documentXml = await archive.file("word/document.xml")?.async("string");

    const goalStart = documentXml?.indexOf(">目 标</w:t>") ?? -1;
    const keyPointStart = documentXml?.indexOf(">重</w:t>", goalStart) ?? -1;
    const preparationStart = documentXml?.indexOf(">准 备</w:t>", keyPointStart) ?? -1;
    const activityStart = documentXml?.indexOf(">内</w:t>", preparationStart) ?? -1;
    const notesStart = documentXml?.indexOf(">备注:</w:t>", activityStart) ?? -1;
    const reflectionStart = documentXml?.indexOf(">反</w:t>", notesStart) ?? -1;

    expect(documentXml?.slice(goalStart, keyPointStart)).toContain("观察纸片在不同操作中的变化。");
    expect(documentXml?.slice(preparationStart, activityStart)).toContain("彩纸、吸管");
    expect(documentXml?.slice(activityStart, notesStart)).toContain("先猜想，再折叠、吹动并交流。");
    expect(documentXml?.slice(notesStart, reflectionStart)).toContain("注意剪刀使用安全。");
    expect(documentXml?.slice(reflectionStart)).toContain("根据幼儿表现调整材料。");
  });
});
