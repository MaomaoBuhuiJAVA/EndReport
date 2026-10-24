export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ReviewFilter = ReviewStatus | "ALL";

export type ReviewWork = {
  id: string;
  title: string;
  description: string | null;
  studentLabel: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  mediaUrl: string;
  thumbnailUrl: string | null;
  status: ReviewStatus;
  visibility: "TEACHER_ONLY" | "PUBLIC";
  reviewNote: string | null;
  libraryDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  owner: { name: string };
  reviewer: { name: string } | null;
};

export type ReviewList = {
  works: ReviewWork[];
  counts: Record<ReviewStatus, number>;
  total: number;
  page: number;
  pageSize: number;
};
