import { describe, expect, it } from "vitest";
import { parseAgentResult } from "./agent-result";

describe("parseAgentResult", () => {
  it("parses the full visual observation schema from the vision model", () => {
    const expected = {
      kind: "vision_observation" as const,
      image_type: "experiment_process",
      visible_materials: ["清水", "蓝色纸片"],
      visible_equipment: ["透明杯", "滴管"],
      observable_steps: ["一只手正在把水滴入杯中"],
      observable_phenomena: ["纸片漂浮在水面"],
      possible_science_concepts: ["可能与浮力有关"],
      safety_risks: ["滴管尖端应避免接触眼睛"],
      evidence_gaps: ["未看到实验开始前的材料摆放"],
      confidence: 0.72,
      privacy_risk: {
        contains_face_or_child: true,
        contains_name_or_identifier: false,
        recommended_visibility: "teacher_only",
      },
    };

    const result = parseAgentResult({
      metadata: { agent_result: expected },
    });

    expect(result).toEqual(expected);
  });

  it("accepts a privacy-risk object alongside the compact visual schema", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "vision_observation",
          image_type: "作品照片",
          facts: ["画面中有一张纸桥"],
          judgements: ["可能在比较纸桥承重"],
          missing_evidence: ["缺少承重数量记录"],
          actions: ["补充不同折法的对照照片"],
          safety: ["使用轻质积木并由教师控制数量"],
          confidence: 0.61,
          privacy_visibility: "teacher_only",
          privacy_risk: {
            contains_face_or_child: false,
            contains_name_or_identifier: true,
            recommended_visibility: "teacher_only",
          },
        },
      },
    });

    expect(result).toMatchObject({
      kind: "vision_observation",
      privacy_risk: {
        contains_face_or_child: false,
        contains_name_or_identifier: true,
        recommended_visibility: "teacher_only",
      },
    });
  });

  it("parses a vision observation result from a dedicated model-text fence", () => {
    const result = parseAgentResult({
      text: [
        "我先整理图片中能直接看到的内容。",
        "```agent-result",
        JSON.stringify({
          kind: "vision_observation",
          image_type: "实验过程照片",
          facts: ["桌面上有透明杯和清水"],
          judgements: ["可能是在观察水的流动"],
          missing_evidence: ["未看到完整操作过程"],
          actions: ["请补充倒水前后的照片"],
          safety: ["使用玻璃容器时由教师协助"],
          confidence: 0.76,
          privacy_visibility: "teacher_only",
          privacy_risk: false,
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toEqual({
      kind: "vision_observation",
      image_type: "实验过程照片",
      facts: ["桌面上有透明杯和清水"],
      judgements: ["可能是在观察水的流动"],
      missing_evidence: ["未看到完整操作过程"],
      actions: ["请补充倒水前后的照片"],
      safety: ["使用玻璃容器时由教师协助"],
      confidence: 0.76,
      privacy_visibility: "teacher_only",
      privacy_risk: false,
    });
  });

  it("parses a same-origin science-poetry cover result", () => {
    const result = parseAgentResult({
      text: [
        "封面已生成。",
        "```agent-result",
        JSON.stringify({
          kind: "poetry_cover",
          cover_url: "/generated/wind-trip.png",
          alt_text: "一阵风带着蒲公英种子穿过蓝天和草地",
          theme_keywords: ["风", "蒲公英", "气流"],
          generation_prompt: "幼儿绘本卡通风格，无文字，3:4 竖版",
          model_name: "Nano Banana",
          retry: false,
        }),
        "```",
      ].join("\n"),
      sameOrigin: "https://qyfck.icu",
    });

    expect(result).toEqual({
      kind: "poetry_cover",
      cover_url: "https://qyfck.icu/generated/wind-trip.png",
      title: "科学诗封面",
      aspect_ratio: "3:4",
      alt_text: "一阵风带着蒲公英种子穿过蓝天和草地",
      theme_keywords: ["风", "蒲公英", "气流"],
      generation_prompt: "幼儿绘本卡通风格，无文字，3:4 竖版",
      model_name: "Nano Banana",
      retry: false,
    });
  });

  it("preserves the structured Qwen cover title, author, and aspect ratio", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "poetry_cover",
          cover_url: "https://upload.dify.ai/files/wind-trip-square.png",
          title: "风的旅行",
          author: "林漪",
          aspect_ratio: "1:1",
          alt_text: "蒲公英种子在风中飞过草地的幼儿绘本画面",
          theme_keywords: ["风", "蒲公英", "气流"],
          generation_prompt: "幼儿绘本卡通风格，无文字",
          model_name: "qwen-image-2.0-pro",
          retry: false,
        },
      },
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      title: "风的旅行",
      author: "林漪",
      aspect_ratio: "1:1",
    });
  });

  it("parses a structured experiment recap with facts separate from judgements", () => {
    const result = parseAgentResult({
      text: [
        "以下是本次活动复盘。",
        "```agent-result",
        JSON.stringify({
          kind: "experiment_recap",
          facts: ["两组幼儿均完成了纸桥搭建"],
          goal_analysis: ["多数幼儿能说出折叠后的纸更结实"],
          issues: {
            materials: ["纸张厚度不一致"],
            steps: ["部分幼儿跳过了预测环节"],
            questions: ["教师追问等待时间较短"],
            organization: ["材料分发集中在活动开始时"],
          },
          improvements: ["每组提供相同规格的纸张并先完成预测记录"],
          validation_points: ["下次观察幼儿是否能比较不同折法的承重差异"],
          safety: ["剪刀由教师按需发放并提醒正确握法"],
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toEqual({
      kind: "experiment_recap",
      facts: ["两组幼儿均完成了纸桥搭建"],
      goal_analysis: ["多数幼儿能说出折叠后的纸更结实"],
      issues: {
        materials: ["纸张厚度不一致"],
        steps: ["部分幼儿跳过了预测环节"],
        questions: ["教师追问等待时间较短"],
        organization: ["材料分发集中在活动开始时"],
      },
      improvements: ["每组提供相同规格的纸张并先完成预测记录"],
      validation_points: ["下次观察幼儿是否能比较不同折法的承重差异"],
      safety: ["剪刀由教师按需发放并提醒正确握法"],
    });
  });

  it("keeps experiment recap facts separate from explicit speculations", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "experiment_recap",
          facts: ["幼儿完成了纸桥搭建"],
          speculations: ["推测/待验证：折叠结构可能提升承重"],
          goal_analysis: ["目标达成情况仍需结合幼儿预测记录判断"],
          issues: {
            materials: ["纸张规格尚未统一"],
            steps: ["缺少预测与记录步骤"],
            questions: ["需要增加比较性提问"],
            organization: ["小组材料分发顺序待优化"],
          },
          improvements: ["统一纸张规格并补充预测记录"],
          validation_points: ["比较不同结构可承受的积木数量"],
          safety: ["重物由教师控制投放"],
        },
      },
    });

    expect(result).toMatchObject({
      kind: "experiment_recap",
      facts: ["幼儿完成了纸桥搭建"],
      speculations: ["推测/待验证：折叠结构可能提升承重"],
    });
  });

  it("parses an experiment recap from Dify's plain JSON code fence", () => {
    const result = parseAgentResult({
      text: [
        "本次复盘如下：",
        "```",
        JSON.stringify({
          kind: "experiment_recap",
          facts: ["第一次纸桥承重结果很低"],
          goal_analysis: ["推测/待验证：幼儿尚未建立结构与承重的联系"],
          issues: {
            materials: ["纸张厚度不一致"],
            steps: ["缺少预测环节"],
            questions: ["需要增加比较性提问"],
            organization: ["材料规格需要统一"],
          },
          improvements: ["统一纸张规格并先做预测"],
          validation_points: ["记录不同结构的承重结果"],
          safety: ["重物由教师控制投放"],
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "experiment_recap",
      facts: ["第一次纸桥承重结果很低"],
      issues: { materials: ["纸张厚度不一致"] },
    });
  });

  it("parses an experiment recap from a json-labelled code fence", () => {
    const result = parseAgentResult({
      text: [
        "复盘结果：",
        "```json",
        JSON.stringify({
          kind: "experiment_recap",
          facts: ["幼儿完成了两种纸桥搭建"],
          goal_analysis: ["待验证：折叠结构可能提升承重"],
          issues: {
            materials: ["尚未统一纸张尺寸"],
            steps: ["缺少结果记录步骤"],
            questions: ["需要补充比较提问"],
            organization: ["小组材料分发顺序待优化"],
          },
          improvements: ["统一材料后增加承重记录"],
          validation_points: ["比较两种结构可承受的积木数量"],
          safety: ["承重物由教师控制"],
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "experiment_recap",
      facts: ["幼儿完成了两种纸桥搭建"],
    });
  });

  it("infers an experiment recap when Dify omits the kind discriminator", () => {
    const result = parseAgentResult({
      text: [
        "复盘结果：",
        "```agent-result",
        JSON.stringify({
          facts: ["两组幼儿均完成了纸桥搭建"],
          goal_analysis: ["推测/待验证：承重差异还需要更多记录"],
          issues: {
            materials: ["纸张厚度不一致"],
            steps: ["部分幼儿跳过预测"],
            questions: ["需要增加比较性提问"],
            organization: ["材料分发顺序需要统一"],
          },
          improvements: ["先完成预测，再进行承重比较"],
          validation_points: ["记录每种纸桥可承受的积木数量"],
          safety: ["重物由教师控制"],
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "experiment_recap",
      facts: ["两组幼儿均完成了纸桥搭建"],
    });
  });

  it("parses work feedback and an optional inquiry task card", () => {
    const result = parseAgentResult({
      text: [
        "我为这首科学诗准备了反馈和后续探究任务。",
        "```agent-result",
        JSON.stringify({
          kind: "work_feedback",
          encouragement: ["你把风吹动树叶的样子写得很清楚"],
          i_saw: ["诗中写到了树叶摇摆和风的方向"],
          i_wonder: ["不同大小的纸片会不会被风吹得一样远？"],
          next_try: ["用两种纸片在安全的室内风源前做比较记录"],
          tags: ["风", "气流", "观察表达"],
          recommended_resources: [
            { resource_id: "science-wind-travel", title: "风的旅行", source: "园本资料库" },
          ],
          task_card: {
            title: "纸片随风旅行",
            materials: ["大小不同的纸片", "记录表"],
            steps: ["先预测哪张纸片飞得更远", "在教师协助下观察并记录"],
            observation_questions: ["哪张纸片移动得更远？"],
            recording_method: "在记录表上画出纸片停下的位置",
            safety: ["不把纸片靠近电风扇网罩"],
          },
          privacy_visibility: "teacher_only",
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toEqual({
      kind: "work_feedback",
      encouragement: ["你把风吹动树叶的样子写得很清楚"],
      i_saw: ["诗中写到了树叶摇摆和风的方向"],
      i_wonder: ["不同大小的纸片会不会被风吹得一样远？"],
      next_try: ["用两种纸片在安全的室内风源前做比较记录"],
      tags: ["风", "气流", "观察表达"],
      recommended_resources: [
        { resource_id: "science-wind-travel", title: "风的旅行", source: "园本资料库" },
      ],
      task_card: {
        title: "纸片随风旅行",
        materials: ["大小不同的纸片", "记录表"],
        steps: ["先预测哪张纸片飞得更远", "在教师协助下观察并记录"],
        observation_questions: ["哪张纸片移动得更远？"],
        recording_method: "在记录表上画出纸片停下的位置",
        safety: ["不把纸片靠近电风扇网罩"],
      },
      privacy_visibility: "teacher_only",
    });
  });

  it("parses a document diagnosis result with revision and export-ready content", () => {
    const expected = {
      kind: "document_diagnosis" as const,
      title: "会跳舞的纸片",
      age_fit: ["目标适合中班，但需要降低记录表文字量"],
      science_accuracy: ["应补充空气流动与纸片运动的关系"],
      material_safety: ["电风扇由教师固定并保持安全距离"],
      inquiry_opportunities: ["增加幼儿预测、比较和验证的机会"],
      teacher_questions: ["哪一张纸片移动得更远？你怎么知道？"],
      evidence_gaps: ["缺少幼儿预测记录和活动后的观察证据"],
      reflection_basis: ["当前反思只有结论，没有对应的课堂记录"],
      revision_text: "将活动目标改为：幼儿能预测并比较不同纸片的移动距离。",
      revised_outline: "一、目标\n二、材料与安全\n三、预测与探究\n四、记录与分享",
      delivery_markdown: "# 会跳舞的纸片\n\n## 修订后教案\n请按预测、实验、记录、分享的顺序实施。",
    };

    const result = parseAgentResult({
      text: [
        "已完成教研材料诊断。",
        "```agent-result",
        JSON.stringify(expected),
        "```",
      ].join("\n"),
    });

    expect(result).toEqual(expected);
  });

  it("parses a document diagnosis result delivered through Dify metadata", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: JSON.stringify({
          kind: "document_diagnosis",
          title: "纸桥承重活动记录",
          age_fit: ["大班可保留比较记录，但需提供图示支架"],
          science_accuracy: ["将纸的折叠方式与承重差异表述为可观察现象"],
          material_safety: ["承重物使用轻质积木并由教师控制数量"],
          inquiry_opportunities: ["先让幼儿预测，再比较不同折法"],
          teacher_questions: ["哪一种纸桥承受的积木更多？"],
          evidence_gaps: ["未记录每种折法的承重数量"],
          reflection_basis: ["反思需对应预测和记录表中的证据"],
          revision_text: "将提问改为先预测、后验证的开放式问题。",
          revised_outline: "目标\n材料\n预测\n搭建\n比较\n分享",
          delivery_markdown: "# 纸桥承重活动记录\n\n## 导出稿\n保留幼儿的比较记录。",
        }),
      },
    });

    expect(result).toMatchObject({
      kind: "document_diagnosis",
      title: "纸桥承重活动记录",
      revision_text: "将提问改为先预测、后验证的开放式问题。",
      delivery_markdown: "# 纸桥承重活动记录\n\n## 导出稿\n保留幼儿的比较记录。",
    });
  });

  it("keeps document data gaps separate from next research questions", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "document_diagnosis",
          title: "纸桥承重活动记录",
          age_fit: ["大班可保留比较记录，但需提供图示支架"],
          science_accuracy: ["将纸的折叠方式与承重差异表述为可观察现象"],
          material_safety: ["承重物使用轻质积木并由教师控制数量"],
          inquiry_opportunities: ["先让幼儿预测，再比较不同折法"],
          teacher_questions: ["哪一种纸桥承受的积木更多？"],
          evidence_gaps: ["原记录未说明承重测试的环境条件"],
          data_gaps: ["未记录每种折法的承重数量和重复次数"],
          research_questions: ["在相同纸张和重量条件下，哪种折法更稳定？"],
          reflection_basis: ["反思需对应预测和记录表中的证据"],
          revision_text: "将提问改为先预测、后验证的开放式问题。",
          revised_outline: "目标\n材料\n预测\n搭建\n比较\n分享",
          delivery_markdown: "# 纸桥承重活动记录\n\n## 导出稿\n保留幼儿的比较记录。",
        },
      },
    });

    expect(result).toMatchObject({
      kind: "document_diagnosis",
      data_gaps: ["未记录每种折法的承重数量和重复次数"],
      research_questions: ["在相同纸张和重量条件下，哪种折法更稳定？"],
    });
  });

  it("infers document diagnosis when Dify omits the kind field", () => {
    const result = parseAgentResult({
      text: [
        "已完成对上传文件的解析与整理：",
        "```agent-result",
        JSON.stringify({
          title: "会跳舞的纸片——中班科学活动家长回顾",
          age_fit: ["本次整理未展开年龄诊断，原记录标注为中班。"],
          science_accuracy: ["空气流动会让纸片动起来的表述基本准确。"],
          material_safety: ["扇子不对准同伴的脸和眼睛。"],
          inquiry_opportunities: ["活动包含观察、操作、记录和分享。"],
          teacher_questions: ["文件中未提供教师的具体提问语言。"],
          evidence_gaps: ["文件中未提供幼儿的具体观察记录。"],
          reflection_basis: ["文件中未提供教师课后反思。"],
          revision_text: "亲爱的家长朋友：本周我们一起探索会跳舞的纸片。",
          revised_outline: "一、活动信息\n二、活动过程\n三、安全提醒",
          delivery_markdown: "# 会跳舞的纸片\n\n## 家长回顾\n空气流动让纸片动起来。",
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "document_diagnosis",
      title: "会跳舞的纸片——中班科学活动家长回顾",
      delivery_markdown: "# 会跳舞的纸片\n\n## 家长回顾\n空气流动让纸片动起来。",
    });
  });

  it("parses an explicit degraded result from Dify metadata", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "degraded",
          code: "generation_failed",
          message: "图片服务暂时不可用，请稍后重试。",
          retry: true,
          retry_reason: "当前图像模型未返回可用图片。",
        },
      },
    });

    expect(result).toEqual({
      kind: "degraded",
      code: "generation_failed",
      message: "图片服务暂时不可用，请稍后重试。",
      retry: true,
      retry_reason: "当前图像模型未返回可用图片。",
    });
  });

  it.each([
    ["true", true],
    ["false", false],
  ] as const)("parses clear string boolean retry value %s from Dify degraded metadata", (retryValue, expectedRetry) => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "degraded",
          code: "model_unavailable",
          message: "视觉模型暂时不可用，请稍后重试。",
          retry: retryValue,
        },
      },
    });

    expect(result).toMatchObject({
      kind: "degraded",
      code: "model_unavailable",
      message: "视觉模型暂时不可用，请稍后重试。",
      retry: expectedRetry,
    });
  });

  it("rejects non-boolean retry strings from Dify degraded metadata", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "degraded",
          code: "model_unavailable",
          message: "视觉模型暂时不可用，请稍后重试。",
          retry: "yes",
        },
      },
    });

    expect(result).toMatchObject({
      kind: "degraded",
      code: "invalid_result",
      retry: true,
    });
  });

  it("rejects an untrusted external cover URL as a retryable degraded result", () => {
    const result = parseAgentResult({
      text: [
        "```agent-result",
        JSON.stringify({
          kind: "poetry_cover",
          cover_url: "https://untrusted.example/cover.png",
          alt_text: "不应渲染的图片",
          theme_keywords: ["风"],
          generation_prompt: "幼儿绘本风格",
          model_name: "Nano Banana",
          retry: false,
        }),
        "```",
      ].join("\n"),
      sameOrigin: "https://qyfck.icu",
    });

    expect(result).toEqual({
      kind: "degraded",
      code: "untrusted_url",
      message: "封面图片地址不受信任，请重新生成。",
      retry: true,
      retry_reason: "仅支持本站或 Dify 返回的图片地址。",
    });
  });

  it("degrades malformed agent-result JSON received through Dify metadata", () => {
    const result = parseAgentResult({ metadata: { agent_result: "{not valid json" } });

    expect(result).toEqual({
      kind: "degraded",
      code: "malformed_json",
      message: "结构化结果格式无效，请重新生成。",
      retry: true,
    });
  });

  it("accepts a Dify-hosted cover URL without a same-origin setting", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "poetry_cover",
          cover_url: "https://api.dify.ai/v1/files/cover.png",
          alt_text: "风吹动纸片的绘本画面",
          theme_keywords: ["风", "纸片"],
          generation_prompt: "幼儿绘本卡通风格，无文字",
          model_name: "Nano Banana",
          retry: false,
        },
      },
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://api.dify.ai/v1/files/cover.png",
    });
  });

  it("turns a Tongyi Dify cover Markdown image into a safe poetry-cover result", () => {
    const result = parseAgentResult({
      text: [
        "## 科学诗封面",
        "已由通义 AIGC 生成封面图片：",
        "![风的旅行幼儿绘本封面](https://upload.dify.ai/files/wind-trip.png)",
        "封面按幼儿绘本风格生成。",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip.png",
      alt_text: "风的旅行幼儿绘本封面",
      model_name: "通义 AIGC",
      retry: false,
    });
  });

  it("prefers a trusted Tongyi image when stale metadata contains an untrusted cover URL", () => {
    const result = parseAgentResult({
      metadata: {
        agent_result: {
          kind: "poetry_cover",
          cover_url: "https://untrusted.example/stale-cover.png",
          alt_text: "旧封面",
          theme_keywords: ["风"],
          generation_prompt: "幼儿绘本卡通风格",
          model_name: "通义 AIGC",
          retry: false,
        },
      },
      text: [
        "## 科学诗封面",
        "已由通义 AIGC 生成封面图片：",
        "![风的旅行幼儿绘本封面](https://upload.dify.ai/files/wind-trip-signed.png?timestamp=1&sign=test=)",
      ].join("\n"),
      sameOrigin: "https://www.qyfck.icu/api/ai-chat",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip-signed.png?timestamp=1&sign=test=",
      retry: false,
    });
  });

  it("prefers a trusted Tongyi image when stale file metadata contains an untrusted URL", () => {
    const result = parseAgentResult({
      text: [
        "## 科学诗封面",
        "已由通义 AIGC 生成封面图片：",
        "![风的旅行幼儿绘本封面](https://upload.dify.ai/files/wind-trip-current.png?timestamp=2&sign=test=)",
      ].join("\n"),
      files: [{
        type: "image",
        remote_url: "https://internal.dify.local/files/stale-cover.png",
      }],
      sameOrigin: "https://www.qyfck.icu/api/ai-chat",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip-current.png?timestamp=2&sign=test=",
      retry: false,
    });
  });

  it("prefers a trusted Tongyi image when stale file metadata contains an untrusted URL", () => {
    const result = parseAgentResult({
      text: [
        "## 科学诗封面",
        "已由通义 AIGC 生成封面图片：",
        "![风的旅行幼儿绘本封面](https://upload.dify.ai/files/wind-trip-current.png?timestamp=2&sign=test=)",
      ].join("\n"),
      files: [{
        type: "image",
        remote_url: "https://internal.dify.local/files/stale-cover.png",
      }],
      sameOrigin: "https://www.qyfck.icu/api/ai-chat",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip-current.png?timestamp=2&sign=test=",
      retry: false,
    });
  });

  it("rejects an untrusted Tongyi-style Markdown cover URL", () => {
    const result = parseAgentResult({
      text: [
        "## 科学诗封面",
        "已由通义 AIGC 生成封面图片：",
        "![不可信封面](https://untrusted.example/wind-trip.png)",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "degraded",
      code: "untrusted_url",
      retry: true,
    });
  });

  it("turns a Tongyi Dify image file output into a safe poetry-cover result", () => {
    const result = parseAgentResult({
      text: "## 科学诗封面\n已由通义 AIGC 生成封面图片：",
      files: [
        {
          type: "image",
          transfer_method: "remote_url",
          remote_url: "https://upload.dify.ai/files/wind-trip.png",
          name: "风的旅行幼儿绘本封面.png",
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip.png",
      alt_text: "风的旅行幼儿绘本封面.png",
      model_name: "通义 AIGC",
      retry: false,
    });
  });

  it("uses Qwen file metadata for the cover presentation before query fallbacks", () => {
    const result = parseAgentResult({
      query: "请生成《雨后彩虹》科学诗封面",
      text: "## 科学诗封面\n已由通义 AIGC 生成封面图片：",
      files: [
        {
          type: "image",
          remote_url: "https://upload.dify.ai/files/wind-trip-landscape.png",
          metadata: {
            title: "风的旅行",
            author: "中班科学组",
            width: 1920,
            height: 1080,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      title: "风的旅行",
      author: "中班科学组",
      aspect_ratio: "16:9",
    });
  });

  it("enriches a structured cover result with metadata from its matching Qwen file", () => {
    const result = parseAgentResult({
      query: "请生成《雨后彩虹》科学诗封面",
      metadata: {
        agent_result: {
          kind: "poetry_cover",
          cover_url: "https://upload.dify.ai/files/wind-trip.png",
          alt_text: "一阵风带着蒲公英种子飞过草地",
          theme_keywords: ["风", "蒲公英"],
          generation_prompt: "幼儿绘本卡通风格，无文字",
          model_name: "qwen-image-2.0-pro",
          retry: false,
        },
        files: [
          {
            type: "image",
            remote_url: "https://upload.dify.ai/files/wind-trip.png",
            metadata: {
              title: "风的旅行",
              author: "中班科学组",
              width: 1728,
              height: 2368,
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      title: "风的旅行",
      author: "中班科学组",
      aspect_ratio: "3:4",
    });
  });

  it("uses the original cover request when Dify returns an image file without answer text", () => {
    const result = parseAgentResult({
      query: "生成《风的旅行》科学诗封面",
      files: [{
        type: "image",
        belongs_to: "assistant",
        url: "https://upload.dify.ai/files/wind-trip.png",
      }],
      sameOrigin: "https://www.qyfck.icu/api/ai-chat",
      difyApiUrl: "https://api.dify.ai/v1/chat-messages",
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      cover_url: "https://upload.dify.ai/files/wind-trip.png",
      title: "风的旅行",
      aspect_ratio: "3:4",
      theme_keywords: ["科学诗", "风的旅行", "幼儿绘本"],
    });
  });

  it("uses an explicitly labelled author from the Qwen cover request when the image file has no metadata", () => {
    const result = parseAgentResult({
      query: "请为《风的旅行》生成科学诗封面，作者：林漪，3:4竖版",
      files: [{
        type: "image",
        remote_url: "https://upload.dify.ai/files/wind-trip-no-metadata.png",
      }],
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      title: "风的旅行",
      author: "林漪",
    });
  });

  it("prefers a Qwen file metadata author over an explicitly labelled query author", () => {
    const result = parseAgentResult({
      query: "请为《风的旅行》生成科学诗封面，作者为林漪，3:4竖版",
      files: [{
        type: "image",
        remote_url: "https://upload.dify.ai/files/wind-trip-with-metadata.png",
        metadata: { author: "中班科学组" },
      }],
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      author: "中班科学组",
    });
  });

  it("does not infer an author for a Qwen cover request without an explicit author label", () => {
    const result = parseAgentResult({
      query: "请为《风的旅行》生成科学诗封面，3:4竖版",
      files: [{
        type: "image",
        remote_url: "https://upload.dify.ai/files/wind-trip-no-author.png",
      }],
    });

    expect(result).toMatchObject({
      kind: "poetry_cover",
      title: "风的旅行",
    });
    expect(result).not.toHaveProperty("author");
  });

  it("returns a retryable result when Tongyi finishes without an image file", () => {
    const result = parseAgentResult({
      text: "## 科学诗封面\n通义 AIGC 已完成生成，但本次没有返回图片文件。",
      files: [],
    });

    expect(result).toEqual({
      kind: "degraded",
      code: "generation_failed",
      message: "通义 AIGC 已执行，但没有返回可用的封面图片，请重试。",
      retry: true,
      retry_reason: "请确认 Dify 的 Qwen-文生图节点输出已连接到文件交付节点。",
    });
  });

  it("explains when the Tongyi plugin is blocked by an arrearage account state", () => {
    const result = parseAgentResult({
      text: [
        "## 科学诗封面",
        "已由通义 AIGC 生成封面图片：",
        'API 响应状态码: 400 响应内容: {"code":"Arrearage","message":"Access denied, please make sure your account is in good standing."}',
      ].join("\n"),
      files: [],
    });

    expect(result).toEqual({
      kind: "degraded",
      code: "model_unavailable",
      message: "通义 AIGC 当前账户状态受限，暂时无法生成封面图片。",
      retry: true,
      retry_reason: "请在 Dify 通义 AIGC 插件凭据对应的阿里云账户恢复服务后重试。",
    });
  });

  it("rejects an untrusted Tongyi Dify image file output", () => {
    const result = parseAgentResult({
      text: "## 科学诗封面\n已由通义 AIGC 生成封面图片：",
      files: [
        {
          type: "image",
          transfer_method: "remote_url",
          remote_url: "https://untrusted.example/wind-trip.png",
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "degraded",
      code: "untrusted_url",
      retry: true,
    });
  });

  it("leaves ordinary Markdown and generic JSON fences unclassified", () => {
    expect(
      parseAgentResult({
        text: "这是一段普通说明。\n\n```json\n{\"kind\":\"poetry_cover\"}\n```",
      }),
    ).toBeNull();
  });

  it("does not infer document diagnosis from a generic complete JSON fence", () => {
    expect(
      parseAgentResult({
        text: [
          "普通资料：",
          "```json",
          JSON.stringify({
            title: "普通资料",
            age_fit: ["适合中班"],
            science_accuracy: ["待教师核对"],
            material_safety: ["按教师说明操作"],
            inquiry_opportunities: ["可补充观察问题"],
            teacher_questions: ["你看到了什么？"],
            evidence_gaps: ["缺少课堂记录"],
            reflection_basis: ["没有反思原文"],
            revision_text: "待整理",
            revised_outline: "待整理",
            delivery_markdown: "待整理",
          }),
          "```",
        ].join("\n"),
      }),
    ).toBeNull();
  });

  it("keeps untrusted cover URLs on the explicit security fallback", () => {
    const result = parseAgentResult({
      text: [
        "```json",
        JSON.stringify({
          kind: "poetry_cover",
          cover_url: "https://untrusted.example/wind-trip.png",
        }),
        "```",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      kind: "degraded",
      code: "untrusted_url",
      retry: true,
    });
  });
});
