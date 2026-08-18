export type PrivacyVisibility = "teacher_only" | "public_after_review";

export type VisionPrivacyVisibility = "teacher_only" | "internal_team" | "safe_to_share";

export type VisionPrivacyRisk = {
  contains_face_or_child: boolean;
  contains_name_or_identifier: boolean;
  recommended_visibility: VisionPrivacyVisibility;
};

export type VisionObservationResult = {
  kind: "vision_observation";
  image_type: string;
  /** Compact fields emitted by the final advice node. */
  facts?: string[];
  judgements?: string[];
  missing_evidence?: string[];
  actions?: string[];
  safety?: string[];
  /** Detailed fields emitted by the dedicated vision model. */
  visible_materials?: string[];
  visible_equipment?: string[];
  observable_steps?: string[];
  observable_phenomena?: string[];
  possible_science_concepts?: string[];
  safety_risks?: string[];
  evidence_gaps?: string[];
  confidence: number;
  privacy_visibility?: PrivacyVisibility;
  privacy_risk: boolean | VisionPrivacyRisk;
};

export type PoetryCoverResult = {
  kind: "poetry_cover";
  cover_url: string;
  alt_text: string;
  theme_keywords: string[];
  generation_prompt: string;
  model_name: string;
  retry: boolean;
  retry_reason?: string;
};

export type ExperimentRecapIssues = {
  materials: string[];
  steps: string[];
  questions: string[];
  organization: string[];
};

export type ExperimentRecapResult = {
  kind: "experiment_recap";
  facts: string[];
  goal_analysis: string[];
  issues: ExperimentRecapIssues;
  improvements: string[];
  validation_points: string[];
  safety: string[];
};

export type DocumentDiagnosisResult = {
  kind: "document_diagnosis";
  title: string;
  age_fit: string[];
  science_accuracy: string[];
  material_safety: string[];
  inquiry_opportunities: string[];
  teacher_questions: string[];
  evidence_gaps: string[];
  reflection_basis: string[];
  revision_text: string;
  revised_outline: string;
  delivery_markdown: string;
};

export type RecommendedResource = {
  resource_id: string;
  title: string;
  source?: string;
};

export type InquiryTaskCard = {
  title: string;
  materials: string[];
  steps: string[];
  observation_questions: string[];
  recording_method: string;
  safety: string[];
};

export type WorkFeedbackResult = {
  kind: "work_feedback";
  encouragement: string[];
  i_saw: string[];
  i_wonder: string[];
  next_try: string[];
  tags: string[];
  recommended_resources: RecommendedResource[];
  task_card?: InquiryTaskCard;
  privacy_visibility: PrivacyVisibility;
};

export type AgentResultFailureCode =
  | "attachment_unavailable"
  | "generation_failed"
  | "invalid_result"
  | "malformed_json"
  | "model_unavailable"
  | "untrusted_url";

export type AgentFailureResult = {
  kind: "degraded" | "error";
  code: AgentResultFailureCode;
  message: string;
  retry: boolean;
  retry_reason?: string;
};

export type AgentResult =
  | VisionObservationResult
  | PoetryCoverResult
  | ExperimentRecapResult
  | DocumentDiagnosisResult
  | WorkFeedbackResult
  | AgentFailureResult;

export type AgentResultParseInput = {
  text?: unknown;
  query?: unknown;
  metadata?: unknown;
  files?: unknown;
  sameOrigin?: string;
  difyApiUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) return null;
  return value.map((item) => item.trim());
}

function optionalStringArray(value: Record<string, unknown>, key: string): string[] | undefined | null {
  if (!(key in value)) return undefined;
  return stringArray(value[key]);
}

function parseVisionPrivacyRisk(value: unknown): boolean | VisionPrivacyRisk | null {
  if (typeof value === "boolean") return value;
  if (!isRecord(value)) return null;

  const containsFaceOrChild = value.contains_face_or_child;
  const containsNameOrIdentifier = value.contains_name_or_identifier;
  const recommendedVisibility = value.recommended_visibility;
  if (
    typeof containsFaceOrChild !== "boolean" ||
    typeof containsNameOrIdentifier !== "boolean" ||
    (recommendedVisibility !== "teacher_only" &&
      recommendedVisibility !== "internal_team" &&
      recommendedVisibility !== "safe_to_share")
  ) {
    return null;
  }

  return {
    contains_face_or_child: containsFaceOrChild,
    contains_name_or_identifier: containsNameOrIdentifier,
    recommended_visibility: recommendedVisibility,
  };
}

function parseVisionObservation(value: Record<string, unknown>): VisionObservationResult | null {
  const imageType = typeof value.image_type === "string" ? value.image_type.trim() : "";
  const facts = optionalStringArray(value, "facts");
  const judgements = optionalStringArray(value, "judgements");
  const missingEvidence = optionalStringArray(value, "missing_evidence");
  const actions = optionalStringArray(value, "actions");
  const safety = optionalStringArray(value, "safety");
  const visibleMaterials = optionalStringArray(value, "visible_materials");
  const visibleEquipment = optionalStringArray(value, "visible_equipment");
  const observableSteps = optionalStringArray(value, "observable_steps");
  const observablePhenomena = optionalStringArray(value, "observable_phenomena");
  const possibleScienceConcepts = optionalStringArray(value, "possible_science_concepts");
  const safetyRisks = optionalStringArray(value, "safety_risks");
  const evidenceGaps = optionalStringArray(value, "evidence_gaps");
  const confidence = value.confidence;
  const privacyVisibility = value.privacy_visibility;
  const privacyRisk = parseVisionPrivacyRisk(value.privacy_risk);
  const hasFullFields = [
    "visible_materials",
    "visible_equipment",
    "observable_steps",
    "observable_phenomena",
    "possible_science_concepts",
    "safety_risks",
    "evidence_gaps",
  ].some((key) => key in value);
  const hasCompactFields = ["facts", "judgements", "missing_evidence", "actions", "safety"].some((key) => key in value);
  const compactFieldsComplete = [facts, judgements, missingEvidence, actions, safety].every((field) => field !== undefined && field !== null);
  const fullFieldsComplete = [
    visibleMaterials,
    visibleEquipment,
    observableSteps,
    observablePhenomena,
    possibleScienceConcepts,
    safetyRisks,
    evidenceGaps,
  ].every((field) => field !== undefined && field !== null);
  const validPrivacyVisibility =
    privacyVisibility === undefined ||
    privacyVisibility === "teacher_only" ||
    privacyVisibility === "public_after_review";

  if (
    !imageType ||
    privacyRisk === null ||
    (hasFullFields ? !fullFieldsComplete : !hasCompactFields || !compactFieldsComplete) ||
    !validPrivacyVisibility ||
    typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 ||
    (!hasFullFields && privacyVisibility === undefined)
  ) {
    return null;
  }

  return {
    kind: "vision_observation",
    image_type: imageType,
    ...(facts ? { facts } : {}),
    ...(judgements ? { judgements } : {}),
    ...(missingEvidence ? { missing_evidence: missingEvidence } : {}),
    ...(actions ? { actions } : {}),
    ...(safety ? { safety } : {}),
    ...(visibleMaterials ? { visible_materials: visibleMaterials } : {}),
    ...(visibleEquipment ? { visible_equipment: visibleEquipment } : {}),
    ...(observableSteps ? { observable_steps: observableSteps } : {}),
    ...(observablePhenomena ? { observable_phenomena: observablePhenomena } : {}),
    ...(possibleScienceConcepts ? { possible_science_concepts: possibleScienceConcepts } : {}),
    ...(safetyRisks ? { safety_risks: safetyRisks } : {}),
    ...(evidenceGaps ? { evidence_gaps: evidenceGaps } : {}),
    confidence,
    ...(privacyVisibility ? { privacy_visibility: privacyVisibility } : {}),
    privacy_risk: privacyRisk,
  };
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function isDifyHost(hostname: string) {
  return hostname === "dify.ai" || hostname.endsWith(".dify.ai") || hostname === "udify.app" || hostname.endsWith(".udify.app");
}

function safeResultUrl(value: unknown, { sameOrigin, difyApiUrl }: AgentResultParseInput): string | null {
  const raw = requiredString(value);
  if (!raw) return null;

  let sameOriginUrl: URL | null = null;
  if (typeof sameOrigin === "string" && sameOrigin.trim()) {
    try {
      sameOriginUrl = new URL(sameOrigin);
    } catch {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(raw, sameOriginUrl?.origin);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (sameOriginUrl && url.origin === sameOriginUrl.origin) return url.toString();
  if (url.protocol === "https:" && isDifyHost(url.hostname)) return url.toString();

  if (typeof difyApiUrl === "string" && difyApiUrl.trim()) {
    try {
      const difyOrigin = new URL(difyApiUrl).origin;
      if (url.protocol === "https:" && url.origin === difyOrigin) return url.toString();
    } catch {
      return null;
    }
  }
  return null;
}

function parsePoetryCover(value: Record<string, unknown>, input: AgentResultParseInput): PoetryCoverResult | null {
  const coverUrl = safeResultUrl(value.cover_url, input);
  const altText = requiredString(value.alt_text);
  const themeKeywords = stringArray(value.theme_keywords);
  const generationPrompt = requiredString(value.generation_prompt);
  const modelName = requiredString(value.model_name);
  const retryReason = value.retry_reason === undefined ? undefined : requiredString(value.retry_reason);
  if (!coverUrl || !altText || !themeKeywords || !generationPrompt || !modelName || typeof value.retry !== "boolean" || (value.retry_reason !== undefined && !retryReason)) {
    return null;
  }

  return {
    kind: "poetry_cover",
    cover_url: coverUrl,
    alt_text: altText,
    theme_keywords: themeKeywords,
    generation_prompt: generationPrompt,
    model_name: modelName,
    retry: value.retry,
    ...(retryReason ? { retry_reason: retryReason } : {}),
  };
}

function parseExperimentRecap(value: Record<string, unknown>): ExperimentRecapResult | null {
  if (!isRecord(value.issues)) return null;
  const facts = stringArray(value.facts);
  const goalAnalysis = stringArray(value.goal_analysis);
  const materials = stringArray(value.issues.materials);
  const steps = stringArray(value.issues.steps);
  const questions = stringArray(value.issues.questions);
  const organization = stringArray(value.issues.organization);
  const improvements = stringArray(value.improvements);
  const validationPoints = stringArray(value.validation_points);
  const safety = stringArray(value.safety);
  if (!facts || !goalAnalysis || !materials || !steps || !questions || !organization || !improvements || !validationPoints || !safety) {
    return null;
  }

  return {
    kind: "experiment_recap",
    facts,
    goal_analysis: goalAnalysis,
    issues: { materials, steps, questions, organization },
    improvements,
    validation_points: validationPoints,
    safety,
  };
}

function parseDocumentDiagnosis(value: Record<string, unknown>): DocumentDiagnosisResult | null {
  const title = requiredString(value.title);
  const ageFit = stringArray(value.age_fit);
  const scienceAccuracy = stringArray(value.science_accuracy);
  const materialSafety = stringArray(value.material_safety);
  const inquiryOpportunities = stringArray(value.inquiry_opportunities);
  const teacherQuestions = stringArray(value.teacher_questions);
  const evidenceGaps = stringArray(value.evidence_gaps);
  const reflectionBasis = stringArray(value.reflection_basis);
  const revisionText = requiredString(value.revision_text);
  const revisedOutline = requiredString(value.revised_outline);
  const deliveryMarkdown = requiredString(value.delivery_markdown);

  if (
    !title || !ageFit || !scienceAccuracy || !materialSafety || !inquiryOpportunities ||
    !teacherQuestions || !evidenceGaps || !reflectionBasis || !revisionText ||
    !revisedOutline || !deliveryMarkdown
  ) {
    return null;
  }

  return {
    kind: "document_diagnosis",
    title,
    age_fit: ageFit,
    science_accuracy: scienceAccuracy,
    material_safety: materialSafety,
    inquiry_opportunities: inquiryOpportunities,
    teacher_questions: teacherQuestions,
    evidence_gaps: evidenceGaps,
    reflection_basis: reflectionBasis,
    revision_text: revisionText,
    revised_outline: revisedOutline,
    delivery_markdown: deliveryMarkdown,
  };
}

function parseRecommendedResources(value: unknown): RecommendedResource[] | null {
  if (!Array.isArray(value)) return null;
  const resources: RecommendedResource[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) return null;
    const resourceId = requiredString(candidate.resource_id);
    const title = requiredString(candidate.title);
    const source = candidate.source === undefined ? undefined : requiredString(candidate.source);
    if (!resourceId || !title || (candidate.source !== undefined && !source)) return null;
    resources.push({ resource_id: resourceId, title, ...(source ? { source } : {}) });
  }
  return resources;
}

function parseInquiryTaskCard(value: unknown): InquiryTaskCard | null {
  if (!isRecord(value)) return null;
  const title = requiredString(value.title);
  const materials = stringArray(value.materials);
  const steps = stringArray(value.steps);
  const observationQuestions = stringArray(value.observation_questions);
  const recordingMethod = requiredString(value.recording_method);
  const safety = stringArray(value.safety);
  if (!title || !materials || !steps || !observationQuestions || !recordingMethod || !safety) return null;
  return {
    title,
    materials,
    steps,
    observation_questions: observationQuestions,
    recording_method: recordingMethod,
    safety,
  };
}

function parseWorkFeedback(value: Record<string, unknown>): WorkFeedbackResult | null {
  const encouragement = stringArray(value.encouragement);
  const iSaw = stringArray(value.i_saw);
  const iWonder = stringArray(value.i_wonder);
  const nextTry = stringArray(value.next_try);
  const tags = stringArray(value.tags);
  const recommendedResources = parseRecommendedResources(value.recommended_resources);
  const privacyVisibility = value.privacy_visibility;
  const taskCard = value.task_card === undefined ? undefined : parseInquiryTaskCard(value.task_card);
  if (
    !encouragement || !iSaw || !iWonder || !nextTry || !tags || !recommendedResources ||
    (privacyVisibility !== "teacher_only" && privacyVisibility !== "public_after_review") ||
    (value.task_card !== undefined && !taskCard)
  ) {
    return null;
  }

  return {
    kind: "work_feedback",
    encouragement,
    i_saw: iSaw,
    i_wonder: iWonder,
    next_try: nextTry,
    tags,
    recommended_resources: recommendedResources,
    ...(taskCard ? { task_card: taskCard } : {}),
    privacy_visibility: privacyVisibility,
  };
}

const FAILURE_CODES = new Set<AgentResultFailureCode>([
  "attachment_unavailable",
  "generation_failed",
  "invalid_result",
  "malformed_json",
  "model_unavailable",
  "untrusted_url",
]);

function parseFailureResult(value: Record<string, unknown>): AgentFailureResult | null {
  const code = value.code;
  const message = requiredString(value.message);
  const retry = parseBoolean(value.retry);
  const retryReason = value.retry_reason === undefined ? undefined : requiredString(value.retry_reason);
  if (
    (value.kind !== "degraded" && value.kind !== "error") ||
    typeof code !== "string" || !FAILURE_CODES.has(code as AgentResultFailureCode) ||
    !message || retry === null ||
    (value.retry_reason !== undefined && !retryReason)
  ) {
    return null;
  }

  return {
    kind: value.kind,
    code: code as AgentResultFailureCode,
    message,
    retry,
    ...(retryReason ? { retry_reason: retryReason } : {}),
  };
}

function parseCandidate(value: unknown, input: AgentResultParseInput): AgentResult | null {
  if (!isRecord(value)) return null;
  // Dify structured-output responses can contain the complete document schema
  // without echoing its discriminator. Accept only the full strict shape.
  if (!("kind" in value)) return parseDocumentDiagnosis(value);
  if (value.kind === "vision_observation") return parseVisionObservation(value);
  if (value.kind === "poetry_cover") return parsePoetryCover(value, input);
  if (value.kind === "experiment_recap") return parseExperimentRecap(value);
  if (value.kind === "document_diagnosis") return parseDocumentDiagnosis(value);
  if (value.kind === "work_feedback") return parseWorkFeedback(value);
  if (value.kind === "degraded" || value.kind === "error") return parseFailureResult(value);
  return null;
}

function fencedResultText(text: string): string | null {
  const match = text.match(/```agent-result\s*\n([\s\S]*?)\n```/iu);
  return match?.[1]?.trim() || null;
}

function tongyiCoverContext(text: string, query: string) {
  return [text.trim(), query.trim()].filter(Boolean).join("\n");
}

function parseTongyiCoverMarkdown(text: string, input: AgentResultParseInput): AgentResult | null {
  if (!/(?:科学诗封面|通义\s*AIGC)/iu.test(text)) return null;

  const image = text.match(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+["'][^"']*["'])?\)/u);
  if (!image) return null;

  const coverUrl = safeResultUrl(image[2], input);
  if (!coverUrl) {
    return degradedResult(
      "untrusted_url",
      "封面图片地址不受信任，请重新生成。",
      true,
      "仅支持本站或 Dify 返回的图片地址。",
    );
  }

  const altText = image[1]?.trim() || "通义 AIGC 生成的科学诗封面";
  const title = text.match(/[《〈「“"]\s*([^》〉」”"]+?)\s*[》〉」”"]/u)?.[1]?.trim();

  return {
    kind: "poetry_cover",
    cover_url: coverUrl,
    alt_text: altText,
    theme_keywords: title ? ["科学诗", title, "幼儿绘本"] : ["科学诗", "幼儿绘本", "封面"],
    generation_prompt: "通义 AIGC 根据用户请求生成的幼儿绘本风格科学诗封面",
    model_name: "通义 AIGC",
    retry: false,
  };
}

function parseTongyiCoverDegraded(text: string): AgentFailureResult | null {
  if (!/(?:科学诗封面|通义\s*AIGC)/iu.test(text)) return null;

  if (/(?:\bArrearage\b|账户欠费|状态受限|account is in good standing)/iu.test(text)) {
    return degradedResult(
      "model_unavailable",
      "通义 AIGC 当前账户状态受限，暂时无法生成封面图片。",
      true,
      "请在 Dify 通义 AIGC 插件凭据对应的阿里云账户恢复服务后重试。",
    );
  }

  return degradedResult(
    "generation_failed",
    "通义 AIGC 已执行，但没有返回可用的封面图片，请重试。",
    true,
    "请确认 Dify 的 Qwen-文生图节点输出已连接到文件交付节点。",
  );
}

function fileCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.files)) return value.files;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

function fileUrl(value: Record<string, unknown>): string | null {
  for (const key of ["remote_url", "remoteUrl", "url", "preview_url", "download_url", "source_url"]) {
    const candidate = requiredString(value[key]);
    if (candidate) return candidate;
  }
  return null;
}

function fileName(value: Record<string, unknown>): string | null {
  for (const key of ["name", "filename", "file_name", "alt_text"]) {
    const candidate = requiredString(value[key]);
    if (candidate) return candidate;
  }
  return null;
}

function isImageFile(value: Record<string, unknown>, rawUrl: string) {
  const type = requiredString(value.type)?.toLowerCase() ?? "";
  const mimeType = requiredString(value.mime_type)?.toLowerCase() ?? "";
  return type === "image" || type.includes("image") || mimeType.startsWith("image/") ||
    /\.(?:png|jpe?g|gif|webp|bmp|avif|heic|heif)(?:[?#]|$)/iu.test(rawUrl);
}

function parseTongyiCoverFiles(files: unknown, input: AgentResultParseInput, text: string): AgentResult | null {
  if (!/(?:科学诗封面|通义\s*AIGC)/iu.test(text)) return null;

  let sawUntrustedImage = false;
  for (const candidate of fileCandidates(files)) {
    if (!isRecord(candidate)) continue;
    const rawUrl = fileUrl(candidate);
    if (!rawUrl || !isImageFile(candidate, rawUrl)) continue;

    const coverUrl = safeResultUrl(rawUrl, input);
    if (!coverUrl) {
      sawUntrustedImage = true;
      continue;
    }

    const altText = fileName(candidate) ?? "通义 AIGC 生成的科学诗封面";
    const title = text.match(/[《〈「“"]\s*([^》〉」”"]+?)\s*[》〉」”"]/u)?.[1]?.trim();
    return {
      kind: "poetry_cover",
      cover_url: coverUrl,
      alt_text: altText,
      theme_keywords: title ? ["科学诗", title, "幼儿绘本"] : ["科学诗", "幼儿绘本", "封面"],
      generation_prompt: "通义 AIGC 根据用户请求生成的幼儿绘本风格科学诗封面",
      model_name: "通义 AIGC",
      retry: false,
    };
  }

  return sawUntrustedImage
    ? degradedResult(
      "untrusted_url",
      "封面图片地址不受信任，请重新生成。",
      true,
      "仅支持本站或 Dify 返回的图片地址。",
    )
    : null;
}

function degradedResult(
  code: AgentResultFailureCode,
  message: string,
  retry: boolean,
  retryReason?: string,
): AgentFailureResult {
  return {
    kind: "degraded",
    code,
    message,
    retry,
    ...(retryReason ? { retry_reason: retryReason } : {}),
  };
}

function invalidCandidateResult(candidate: unknown, input: AgentResultParseInput): AgentFailureResult {
  if (
    isRecord(candidate) && candidate.kind === "poetry_cover" &&
    typeof candidate.cover_url === "string" && !safeResultUrl(candidate.cover_url, input)
  ) {
    return degradedResult(
      "untrusted_url",
      "封面图片地址不受信任，请重新生成。",
      true,
      "仅支持本站或 Dify 返回的图片地址。",
    );
  }
  return degradedResult(
    "invalid_result",
    "结构化结果格式不完整，请补充信息后重试。",
    true,
  );
}

function metadataResultCandidate(metadata: unknown): unknown {
  if (!isRecord(metadata)) return undefined;
  if ("agent_result" in metadata) return metadata.agent_result;
  if ("agentResult" in metadata) return metadata.agentResult;
  if ("structured_result" in metadata) return metadata.structured_result;
  if ("structuredResult" in metadata) return metadata.structuredResult;
  if ("kind" in metadata) return metadata;
  return undefined;
}

function metadataFilesCandidate(metadata: unknown): unknown {
  if (!isRecord(metadata)) return undefined;
  return metadata.files;
}

function parseMetadataCandidate(metadata: unknown, input: AgentResultParseInput): AgentResult | null {
  const candidate = metadataResultCandidate(metadata);
  if (candidate === undefined) return null;
  if (typeof candidate !== "string") {
    return parseCandidate(candidate, input) ?? invalidCandidateResult(candidate, input);
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parseCandidate(parsed, input) ?? invalidCandidateResult(parsed, input);
  } catch {
    return degradedResult("malformed_json", "结构化结果格式无效，请重新生成。", true);
  }
}

export function parseAgentResult(input: AgentResultParseInput): AgentResult | null {
  const metadataResult = parseMetadataCandidate(input.metadata, input);
  // Dify can retain a stale structured cover result while the current
  // response carries a fresh, trusted image file or Markdown URL. Keep
  // metadata failures as a fallback so those concrete outputs can win.
  const metadataFailure = metadataResult &&
    (metadataResult.kind === "degraded" || metadataResult.kind === "error")
    ? metadataResult
    : null;
  if (metadataResult && !metadataFailure) return metadataResult;
  let deferredFailure: AgentFailureResult | null = metadataFailure;

  const text = typeof input.text === "string" ? input.text : "";
  const query = typeof input.query === "string" ? input.query : "";
  const coverContext = tongyiCoverContext(text, query);
  const candidateText = fencedResultText(text);
  if (candidateText) {
    try {
      const candidate = JSON.parse(candidateText) as unknown;
      return parseCandidate(candidate, input) ?? invalidCandidateResult(candidate, input);
    } catch {
      return degradedResult("malformed_json", "结构化结果格式无效，请重新生成。", true);
    }
  }

  const fileResult = parseTongyiCoverFiles(
    input.files ?? metadataFilesCandidate(input.metadata),
    input,
    coverContext,
  );
  if (fileResult) {
    if (fileResult.kind !== "degraded" && fileResult.kind !== "error") return fileResult;
    deferredFailure ??= fileResult;
  }

  const markdownResult = parseTongyiCoverMarkdown(text, input);
  if (markdownResult) return markdownResult;

  // The Tongyi branch can finish successfully while returning an empty
  // `files` array. Keep that state visible and retryable instead of making it
  // look like a normal text-only answer.
  return deferredFailure ?? parseTongyiCoverDegraded(coverContext);
}
