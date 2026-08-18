import { describe, expect, it } from "vitest";
import { parseAgentResult } from "./agent-result";

describe("parseAgentResult", () => {
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
      alt_text: "一阵风带着蒲公英种子穿过蓝天和草地",
      theme_keywords: ["风", "蒲公英", "气流"],
      generation_prompt: "幼儿绘本卡通风格，无文字，3:4 竖版",
      model_name: "Nano Banana",
      retry: false,
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
      theme_keywords: ["科学诗", "风的旅行", "幼儿绘本"],
    });
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
});
