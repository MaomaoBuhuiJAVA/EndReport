export const SCIENCE_CATEGORIES = [
  "科学诗",
  "科学故事",
  "科学实验",
] as const;

export const SCIENCE_AGE_GROUPS = ["托班", "小班", "中班", "大班"] as const;

export const SCIENCE_RESOURCE_TYPES = [
  "图片资源",
  "教案资源",
  "视频资源",
  "文档资源",
] as const;

export type ScienceCategory = (typeof SCIENCE_CATEGORIES)[number];
export type ScienceResourceType = (typeof SCIENCE_RESOURCE_TYPES)[number];

export interface ScienceResource {
  id: string;
  type: ScienceResourceType;
  knowledgeBaseId: string;
  semester: string;
  title: string;
  filePath: string;
  publicPath: string;
  externalUrl: string;
  source: string;
  isPublic: boolean;
}

export interface ScienceKnowledgeSummary {
  id: string;
  baseId: string;
  semester: string;
  category: ScienceCategory;
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
