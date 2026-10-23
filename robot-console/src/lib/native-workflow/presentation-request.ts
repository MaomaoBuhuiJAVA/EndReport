export type PresentationRequest = {slideCount: number; query: string};

const digits: Record<string, number> = {零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};
function count(value: string) {
  if (/^\d+$/u.test(value)) return Number(value);
  let total = 0, digit = 0;
  for (const char of value) {
    if (char in digits) digit = digits[char];
    else {total += (digit || 1) * (char === "百" ? 100 : 10); digit = 0;}
  }
  return total + digit;
}

export function requestedPresentation(query: string): PresentationRequest | undefined {
  let slideCount: number | undefined;
  const text = query.replace(/https?:\/\/[^\s，。；]+/giu, " ");
  const pattern = /(?<![第\d零一二两三四五六七八九十百])(\d+|[零一二两三四五六七八九十百]{1,6})\s*(?:页|张幻灯片|slides?\b)/giu;
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(Math.max(0, match.index - 64), match.index);
    const suffix = text.slice(match.index + match[0].length);
    // Page indexes and section allocations do not replace a total.
    if (/(?:第|不要|不需要|不是|取消)\s*$/u.test(prefix)
      || /(?:封面|正文|目录|总结|结语|附录)(?:部分)?\s*(?:(?:共|为|用|占|计|需要|安排|各|有|单独|独立|最多|至多|不超过|不多于|至少|不少于|大约|大概|约|[:：])\s*)*(?:[\d零一二两三四五六七八九十百]+\s*(?:页|张幻灯片)?\s*[-–—~～到至]\s*)?$/u.test(prefix)
      || /^\s*(?:的\s*)?(?:封面|正文|目录|总结|结语|附录)/u.test(suffix)) continue;
    // A newer range or bound revokes an earlier exact length in a follow-up.
    if (/(?:最多|至多|不超过|不多于|至少|不少于|大约|大概|约)\s*$/u.test(prefix)
      || /^\s*(?:以内|以[上下]|之内|左右|上下)/u.test(suffix)
      || /[\d零一二两三四五六七八九十百]\s*(?:页|张幻灯片|slides?)?\s*(?:[-–—~～到至]|to)\s*$/iu.test(prefix)
      || /^\s*(?:[-–—~～到至]|to)\s*[\d零一二两三四五六七八九十百]/iu.test(suffix)) {
      slideCount = undefined;
      continue;
    }
    const value = count(match[1]);
    if (Number.isSafeInteger(value) && value > 0) slideCount = value;
  }
  return slideCount ? {slideCount, query} : undefined;
}

const normalizedTitle = (value: string) => value.replace(/[\p{P}\p{S}\s]/gu, "").toLocaleLowerCase();
export function isPresentationTopicTitle(value: string, request: PresentationRequest) {
  const coverQuery = request.query
    .replace(/(?:不(?:需要|需|要|用|包含|包括|含|带|(?:额外|另)?加|制作|设置|设)|无需|无须|无|取消|删除|去掉)(?:额外|另外|另|单独|独立|一个|一张|一页|的|\s)*封面(?:页)?/gu, "")
    .replace(/\b(?:no|without)\s+(?:a\s+)?(?:separate\s+)?cover(?:\s+page)?/giu, "");
  if (/封面|\bcover\b/iu.test(coverQuery)) return false;
  const candidate = normalizedTitle(value);
  const topicQuery = request.query.split(/[，。；;\n]/u)
    .filter((clause, index) => index === 0 || /(?:主题|课题|题目)\s*[:：是为]|关于|以.+为主题/u.test(clause))
    .map(clause => clause.replace(/(?:最后|结尾|末尾|结语|备注|提示语|口号)[\s\S]*$/u, ""))
    .join(" ");
  const topics = Array.from(topicQuery.matchAll(/《([^》]+)》|[“"]([^”"]+)[”"]/gu), match => normalizedTitle(match[1] || match[2]));
  // A model-derived document title cannot prove that an extra page is the topic.
  return value.length <= 120 && candidate.length > 0 && (topics.length
    ? topics.includes(candidate)
    : candidate.length >= 4 && normalizedTitle(topicQuery).includes(candidate));
}

export function presentationPrompt(request: PresentationRequest) {
  return `\n【课件交付格式】\n总共 ${request.slideCount} 页，用户要求的封面也必须计入总页数。每页使用一个 Markdown 标题和正文，相邻页之间只用单独一行 --- 分隔。不要在指定页数之外添加总标题页、目录、结语或附录。`;
}

export class PresentationPageCountError extends Error {
  constructor(expected: number, actual: number) {
    super(`课件页数不符：要求 ${expected} 页，当前正文排版为 ${actual} 页。正文已保留，请重新生成指定页数，或调整页数后导出。`);
    this.name = "PresentationPageCountError";
  }
}
