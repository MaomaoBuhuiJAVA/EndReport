import { NextResponse } from "next/server";
import type { ConversationMessage } from "@/lib/types";
import { nativeTeachingResponse } from "@/lib/native-workflow/response";
import { sanitizeTeachingState } from "@/lib/native-workflow/state";

export const maxDuration = 120;
export const runtime = "nodejs";

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const ATTACHMENT_MIME_BY_EXTENSION = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".txt", "text/plain"],
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".ppt", "application/vnd.ms-powerpoint"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);
const VIDEO_ATTACHMENT_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"]);
const DIRECT_VIDEO_ATTACHMENT_MESSAGE = "暂不支持直接上传视频，请先提取关键帧或整理文字记录后再上传。";
const ATTACHMENT_TYPE_MISMATCH_MESSAGE = "附件类型与文件扩展名不一致，请重新选择原始文件。";

type ChatRequestBody = {
  message?: string;
  history?: ConversationMessage[];
  userId?: string;
  conversationId?: string;
  targetResourceId?: string;
  voiceCall?: boolean;
  workflowState?: unknown;
  documentUrl?: string;
};
type ParsedChatRequest = {body: ChatRequestBody; attachment?: File};

function isFileValue(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function parseHistory(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as ConversationMessage[] : undefined;
  } catch {
    return undefined;
  }
}

function parseWorkflowState(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  try {return sanitizeTeachingState(JSON.parse(value));} catch {return undefined;}
}

function attachmentExtension(name: string) {
  const normalized = name.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function validateAttachment(file: File) {
  if (!file.name.trim()) return "附件文件名无效";
  const mimeType = file.type.trim().toLowerCase();
  const extension = attachmentExtension(file.name);
  if (mimeType.startsWith("video/") || VIDEO_ATTACHMENT_EXTENSIONS.has(extension)) {
    return DIRECT_VIDEO_ATTACHMENT_MESSAGE;
  }
  if (file.size <= 0) return "附件内容为空";
  if (file.size > MAX_ATTACHMENT_BYTES) return "附件不能超过 4MB";

  const expectedMimeType = ATTACHMENT_MIME_BY_EXTENSION.get(extension);
  if (!expectedMimeType) {
    return "暂不支持该附件格式，请上传图片、PDF、Word、PPT、Excel 或 TXT 文件";
  }
  if (mimeType && mimeType !== expectedMimeType) return ATTACHMENT_TYPE_MISMATCH_MESSAGE;
  return null;
}

async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { body: (await request.json()) as ChatRequestBody };
  }

  const formData = await request.formData();
  const attachmentValue = formData.get("attachment");
  if (attachmentValue !== null && !isFileValue(attachmentValue)) {
    throw new Error("附件字段无效");
  }
  if (attachmentValue) {
    const attachmentError = validateAttachment(attachmentValue);
    if (attachmentError) throw new Error(attachmentError);
  }

  return {
    body: {
      message: typeof formData.get("message") === "string" ? String(formData.get("message")) : undefined,
      history: parseHistory(formData.get("history")),
      userId: typeof formData.get("userId") === "string" ? String(formData.get("userId")) : undefined,
      conversationId: typeof formData.get("conversationId") === "string" ? String(formData.get("conversationId")) : undefined,
      targetResourceId: typeof formData.get("targetResourceId") === "string" ? String(formData.get("targetResourceId")) : undefined,
      voiceCall: formData.get("voiceCall") === "true",
      workflowState: parseWorkflowState(formData.get("workflowState")),
      documentUrl: typeof formData.get("documentUrl") === "string" ? String(formData.get("documentUrl")) : undefined,
    },
    attachment: attachmentValue ?? undefined,
  };
}

export async function POST(request: Request) {
  let parsedRequest: ParsedChatRequest;
  try {
    parsedRequest = await parseChatRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求格式无效";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { body, attachment } = parsedRequest;

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  return nativeTeachingResponse(request, {
    message, attachment,
    history: Array.isArray(body.history) ? body.history : [],
    voiceCall: body.voiceCall === true,
    workflowState: sanitizeTeachingState(body.workflowState),
    targetResourceId: typeof body.targetResourceId === "string" ? body.targetResourceId : undefined,
    documentUrl: typeof body.documentUrl === "string" ? body.documentUrl : undefined,
  });
}
