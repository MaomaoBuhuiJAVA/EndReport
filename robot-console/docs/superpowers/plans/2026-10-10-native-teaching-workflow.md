# Native Teaching Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace Dify with an owned teaching workflow preserving all nine DSL tasks and improve grounded media retrieval, time to first reply and telephone responsiveness.

**Architecture:** Keep the existing website and its response/event contract. A native workflow routes by task, extracts attachments, searches authoritative local/database resources, calls direct text/vision/image services, validates structured results, and generates real files. All native tasks must work without Dify; unavailable provider settings return explicit recoverable status.

**Tech Stack:** Existing Next.js, TypeScript, Vitest, Prisma, JSZip, mammoth, xlsx; compatible model APIs; file generation libraries as required.

**Spec:** E:/国科二幼/output/dify迁移评估-20261010.md plus user's active objective (all existing features, precise library/media retrieval and smooth telephone mode).

## Global Constraints

- Preserve nine DSL task families, generated documents, image input, uploaded science-poem cover generation, resource IDs, teaching cards and cover synchronization.
- Native mode must never upload to or wait for Dify. Model credentials stay server-side.
- Missing provider configuration may be left for the user; no fabricated success, image or document links.
- Preserve current dirty source as baseline in the isolated worktree; do not overwrite unrelated user changes.
- Existing signed-download, stream parser, audio cleanup and privacy/result contracts remain functional.
- Return only media tied to the requested resource; exact title, category, age/semester and topic constraints must not be replaced with unrelated hits.
- Record actual test results and unresolved configuration/runtime gaps. Local implementation is not a production deployment.

## Task 1: Native routing, prompts and direct model transport

Files: create `src/lib/native-workflow/{routing,model,prompts,types}.ts`, tests alongside. Extract original prompts/schemas into `src/data/teaching-workflow.json` using safe YAML parsing; do not execute DSL code or import credentials.

Interfaces: `routeTeachingRequest({message, history, attachmentType, voiceCall})` returns task, format and effective query. `completeModel({messages, schema, vision, voiceCall, signal, onDelta})` returns text; transport handles SSE, abort and bounded upstream errors. Prompt selection consumes DSL snapshot.

- [x] Write routing tests: complete lesson + Word selects document creation; uploaded poem + cover selects cover; attached image + feedback selects feedback; bare image selects vision; follow-up format preserves prior text; phone bypasses classifiers.
- [x] Run `npx vitest run src/lib/native-workflow/routing.test.ts` and observe missing behavior.
- [x] Implement rules with history and attachment-aware priorities; use the general chat path for ambiguous questions without adding a classification roundtrip.
- [x] Test transport against controlled streaming HTTP responses, cancellation and missing key; implement configurable text/vision endpoints and short phone budgets.
- [x] Verify tests pass, preserve original prompt requirements and normalize output schema usage.

## Task 2: Grounded retrieval

Files: `src/lib/search.ts`, `src/lib/science-data.ts`, new `src/lib/native-workflow/resources.ts` and tests.

Interfaces: `retrieveTeachingResources(query, options)` returns context, source titles, actual media and lab links using existing IDs; authoritative data comes from current catalog/database with static fallback.

- [x] Add fixtures demonstrating exact-title/category/age filtering, steps ordering, strict no-hit and same-resource media.
- [x] Run focused tests to observe failures.
- [x] Implement bounded retrieval, query normalization and media selection using existing catalog preparation; do not cache private queries.
- [x] Verify real local catalog examples, including topic-only and all-step-image requests.

## Task 3: Attachments and file delivery

Files: `src/lib/native-workflow/{attachments,documents,artifacts}.ts`, `app/api/ai-chat/artifact/route.ts`, tests and required package updates.

Interfaces: `extractAttachment(file, signal)` returns readable text or data URL with known type. `createTeachingDocument(markdown, format, title)` returns bytes/name/mime. Artifact URLs are signed, bounded, durable for their TTL, served only after verification.

- [x] Test actual TXT/DOCX/PDF/PPTX/XLSX inputs, malformed/unsupported input and content-size limits.
- [x] Implement extraction reusing current libraries; include slide/sheet order and meaningful parser failures.
- [x] Test real file structures and content for all four output formats before implementing generators.
- [x] Implement document generators preserving full lesson content, Chinese font support and slide/table semantics.
- [x] Test signed downloads, tampering, expiry and retrieval in the same process; document storage configuration for multi-instance deployment.

## Task 4: Nine-task execution and API integration

Files: `src/lib/native-workflow/{run,images,response}.ts`, `app/api/ai-chat/route.ts`, `src/lib/ai-chat-stream.ts`, tests.

Interfaces: `nativeTeachingResponse(request, parsedBody, attachment)` produces existing JSON or SSE contract with provider `native`, actual files, valid agentResult, sources/photos/labLinks and explicit failure status.

- [x] Add integration tests with real routing/retrieval and HTTP-only model doubles: no Dify calls, streaming first delta, uploaded poem used in image prompt, vision evidence before feedback, structured failure handling.
- [x] Implement direct text, vision, image and document paths; vision evidence precedes its dependent retrieval/generation; use schemas from DSL and existing `parseAgentResult`.
- [x] Add image generation with one delivery and exact supported aspect sizes; preserve targetResourceId synchronization.
- [x] Make native mode the default entry before legacy Dify uploads. Retain a deliberate legacy mode only as rollback while native verification completes.
- [x] Verify all nine tasks and history-based refinement/export; failures remain honest and retryable.

## Task 5: Telephone pipeline

Files: actual voice-call component and `src/lib/voice-{call,session}.ts`, voice TTS route/provider and tests.

- [x] Locate current recognition, endpointing, chat and speech playback sequence and measure avoidable waits.
- [x] Test final transcript handling, cancellation, stale-result rejection, speech chunk sequencing and no self-recognition.
- [x] Route calls directly to concise streaming text; start TTS on a complete sentence where supported, prefetch subsequent speech and restore listening promptly.
- [x] Verify hangup/mute/cancel cleanup, errors and browser support fallback. Do not claim microphone/voice quality without real browser verification.

## Task 6: Verification and integration

- [x] Run focused tests, full applicable regression suite, TypeScript and lint for changed files; run production build.
- [x] Verify local server JSON/SSE, real generated files and synthetic provider smoke tests with available keys. Record speed timings honestly.
- [x] Review the complete patch for scope, bugs, resource mismatches and missing tasks; resolve material findings.
- [x] Integrate only this task's reviewed changes into the original workspace while preserving unrelated baseline edits.
- [x] Deliver implementation/verification/configuration notes; production behavior and absent providers remain open requirements until verified or explicitly supplied.

## Acceptance boundaries

The checked tasks describe local implementation, automated behavior and actual HTTP/provider checks. Browser interaction, microphone/recognition and device playback are still unverified due to saved browser permission verification failure. Database writes/cover synchronization and production deployment remain external acceptance items. See `2026-10-10-native-teaching-progress.md` for evidence and existing legacy contract failures.
