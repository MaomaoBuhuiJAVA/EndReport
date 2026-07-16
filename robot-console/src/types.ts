export interface KnowledgeResource {
  id: string;
  type: '图片资源' | '教案资源' | '视频资源';
  knowledgeBaseId: string;
  semester: string;
  title: string;
  filePath: string;
  publicPath: string;
  externalUrl: string;
  source: string;
  isPublic: boolean;
}

export interface KnowledgeItem {
  id: string;
  baseId: string;
  semester: string;
  category: '科学诗' | '科学故事' | '科学实验（教师版）' | '科学实验（家长版）';
  title: string;
  ageLabel: string;
  topic: string;
  author: string;
  sourceFile: string;
  sourcePage: string;
  allocationBasis: string;
  tags: string[];
  ingestStatus: string;
  duplicateOf: string;
  knowledgeFile: string;
  imageCount: number;
  videoUrl: string;
  excerpt: string;
  body: string;
  resourceTypes: KnowledgeResource['type'][];
  resources: KnowledgeResource[];
}

export type SemesterFilter =
  | '全部学期'
  | '小班上册'
  | '小班下册'
  | '中班上册'
  | '中班下册'
  | '大班上册'
  | '大班下册';

export type CategoryFilter = KnowledgeItem['category'] | '全部内容';
export type ResourceFilter = KnowledgeResource['type'] | '全部资源';
