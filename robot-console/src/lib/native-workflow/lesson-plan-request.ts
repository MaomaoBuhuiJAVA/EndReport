export type LessonPlanDocumentRequest = {title: string; ageGroup: string; duration: string};

export function requestedLessonPlanDocument(query: string, draft: string, fallbackTitle: string): LessonPlanDocumentRequest | undefined {
  // A mention of an uploaded lesson in a recap/notice request must not turn that prose into a form.
  if (/生成[^。\n]*(?:家长通知|活动回顾)|提取[^。\n]*(?:正文|全文)/u.test(query)
    || !/教案|教学设计|教学活动设计表/u.test(query) || !/活动目标|教学目标/u.test(draft)
    || !/活动准备|材料准备/u.test(draft) || !/活动内容|活动过程|教学过程|活动流程/u.test(draft)) return undefined;
  const last = (...patterns: RegExp[]) => patterns.flatMap(pattern => Array.from(query.matchAll(pattern)))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).at(-1)?.[1]?.trim();
  const title = last(/主题[ \t]*[：:][ \t]*《?([^》；;\n。，,]+)》?/gu, /《([^》]+)》/gu);
  const age = last(/(?:班级(?:[（(]适用年龄段[）)])?|适用年龄段|年龄段)[ \t]*[：:][ \t]*([^；;\n。，,]+)/gu, /((?:托|小|中|大)(?:[一二三四五六七八九十\d]+)?班)/gu);
  const duration = last(/((?:\d+\s*[-—至]\s*)?\d+[ \t]*分钟)/gu);
  return {
    title: title || fallbackTitle,
    ageGroup: age || "",
    duration: duration || "",
  };
}
