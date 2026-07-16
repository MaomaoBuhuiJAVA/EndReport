export const SCIENCE_SEMESTERS = [
  "全部学期",
  "小班上册",
  "小班下册",
  "中班上册",
  "中班下册",
  "大班上册",
  "大班下册",
] as const;

export const SCIENCE_CATEGORIES = [
  "全部内容",
  "科学诗",
  "科学故事",
  "科学实验（教师版）",
  "科学实验（家长版）",
] as const;

export const SCIENCE_RESOURCE_TYPES = [
  "全部资源",
  "图片资源",
  "教案资源",
  "视频资源",
] as const;

export type ScienceSemester = (typeof SCIENCE_SEMESTERS)[number];
export type ScienceCategory = (typeof SCIENCE_CATEGORIES)[number];
export type ScienceResourceType = (typeof SCIENCE_RESOURCE_TYPES)[number];

export interface ScienceResource {
  id: string;
  type: Exclude<ScienceResourceType, "全部资源">;
  knowledgeBaseId: string;
  semester: string;
  title: string;
  publicPath: string;
  externalUrl: string;
  source: string;
  isPublic: boolean;
}

export interface ScienceKnowledgeSummary {
  id: string;
  baseId: string;
  semester: string;
  category: Exclude<ScienceCategory, "全部内容">;
  title: string;
  ageLabel: string;
  topic: string;
  author: string;
  excerpt: string;
  tags: string[];
  resourceTypes: ScienceResource["type"][];
  resources: ScienceResource[];
}

export interface ScienceKnowledgeItem extends ScienceKnowledgeSummary {
  sourceFile: string;
  sourcePage: string;
  allocationBasis: string;
  ingestStatus: string;
  duplicateOf: string;
  imageCount: number;
  videoUrl: string;
  body: string;
}
