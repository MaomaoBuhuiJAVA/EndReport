# Task 3: Attachments and files

Working root: E:/国科二幼/EndReport/.worktrees/native-teaching-workflow/robot-console.

Implement native input extraction and real four-format document output, replacing the Dify document plugin. This is an independent component of the nine-task migration. Read `src/lib/lesson-plan-docx.ts` and existing output-file types first. Own only `src/lib/native-workflow/attachments.ts`, `documents.ts`, `artifacts.ts`, their tests, `app/api/ai-chat/artifact/route.ts` and test, package.json/lock, and document-specific configuration docs. Do not modify ai-chat/route.ts, search, voice, or other workflow modules.

Interfaces to implement verbatim:

```ts
export type ExtractedAttachment = { name: string; type: "image" | "document"; text: string; dataUrl?: string };
export async function extractAttachment(file: File, signal?: AbortSignal): Promise<ExtractedAttachment>;
export type DocumentFormat = "docx" | "pdf" | "pptx" | "xlsx";
export async function createTeachingDocument(markdown: string, format: DocumentFormat, title: string): Promise<{bytes: Uint8Array; name: string; mimeType: string}>;
export async function storeTeachingArtifact(file: {bytes: Uint8Array; name: string; mimeType: string}): Promise<{type:"document";name:string;mimeType:string;url:string}>;
```

Extraction: use actual file content; support TXT, DOCX, PDF, PPTX, XLSX plus legacy DOC/XLS if existing libraries support them. Legacy unsupported PPT must return an explicit explanatory error. Limit size to 4MB matching current request parser and extracted text to 50000 chars. Validate ZIP expansion/entry limits. Do not silently claim full parsing of truncated files; include truncation notice in text. Images should produce correctly typed data URLs from validated bytes. Empty, malformed and unsupported files throw useful errors.

Output: complete Chinese Markdown content, proper headings/lists/tables. Word should preserve all content rather than forcing notices/poems into the lesson template. PDF must support Chinese text via an actually available redistributable font; do not depend solely on Windows system fonts for Linux production. PPTX must preserve slide order/notes from page-separated Markdown. XLSX must parse actual Markdown tables, reject no-table input rather than create a bogus file. No fake file or URL. Every generated format requires real structure/content tests, and PDF/PPTX need rendering checks when tooling permits.

Artifacts: signed opaque URL served by new GET route, persistent storage on local filesystem by default, configurable directory `AI_ARTIFACT_DIR`; root path private, expiry ~24h, bounded files, reject tampering/path traversal/expired token; signing secret configurable `AI_ARTIFACT_SECRET` with persistent local generated fallback (not Dify key). Cancellation honored. Storage route must survive process restart. Never expose credentials or local paths in API errors. Document multi-instance shared storage limitation.

Use TDD: failing behavioral tests first, then implementation and tests. Existing node_modules is a junction to original workspace; you may remove ONLY the junction (verify link type and absolute path), then install independent dependencies here. Never install into shared original node_modules. Announce to parent when independent dependencies ready. You own package updates. No subagents, no publishing/deployment. Commit only your own files. Report to `docs/superpowers/plans/native-documents-report.md` with files, tests, dependency and configuration gaps; final response only status, commits, test summary, concerns.
