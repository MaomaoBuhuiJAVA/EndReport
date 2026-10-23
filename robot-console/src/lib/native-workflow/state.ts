import type { TeachingFormat, TeachingTask } from "./routing";

export type TeachingWorkflowState = {
  task: TeachingTask;
  query: string;
  format?: TeachingFormat;
  pendingFormat?: "reuse" | "generate";
  draft?: string;
  evidenceText?: string;
  resourceIds?: string[];
};
const tasks = new Set(["lesson", "resources", "document_analysis", "document_creation", "illustration", "vision", "poetry_cover", "recap", "feedback", "chat", "voice"]);

/** Client-held state is input data and is validated again on every request. */
export function sanitizeTeachingState(value: unknown): TeachingWorkflowState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const state = value as Record<string, unknown>;
  if (typeof state.task !== "string" || !tasks.has(state.task) || typeof state.query !== "string" || !state.query.trim()) return undefined;
  return {
    task: state.task as TeachingTask, query: state.query.slice(-6000),
    ...(typeof state.format === "string" && ["docx", "pdf", "pptx", "xlsx"].includes(state.format) ? {format: state.format as TeachingFormat} : {}),
    ...(state.pendingFormat === "reuse" || state.pendingFormat === "generate" ? {pendingFormat: state.pendingFormat} : {}),
    ...(typeof state.draft === "string" ? {draft: state.draft.slice(0, 50000)} : {}),
    ...(typeof state.evidenceText === "string" ? {evidenceText: state.evidenceText.slice(0, 50000)} : {}),
    ...(Array.isArray(state.resourceIds) ? {resourceIds: state.resourceIds.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/u.test(id)).slice(0, 5)} : {}),
  };
}
