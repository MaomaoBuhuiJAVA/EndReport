# Qwen and OSS Migration Implementation Plan

> **Execution:** Continue inline in the existing isolated worktree using the planning, test-driven-development and verification skills. Existing user authorization covers implementation and local integration; production deployment is outside this change.

**Goal:** Keep the teaching website's native workflow, replace every remaining runtime Dify/Blob path, and use one Qwen credential for text, vision, speech and generated images.

**Architecture:** A server-only Qwen configuration module resolves the existing speech key and the user-supplied API host. Text/vision use its compatible chat endpoint; image/speech use its multimodal endpoint. A shared private OSS uploader returns stable website media paths; the media endpoint authorizes delivery from actual catalog/work records.

**Tech Stack:** Existing Next.js/TypeScript, Prisma/PostgreSQL, ali-oss, sharp and Vitest. No new hosted workflow/storage dependency.

**Spec:** User instructions on 2026-10-10: use the native Qwen workflow and generate images through the API; reuse the speech credential for Qwen services. API base supplied by user: `https://maas.qianwenaiapi.com/api/v1`.

## Constraints

- Preserve all nine teaching tasks, stateful follow-ups, real document artifacts, attachment handling, precise media retrieval and telephone streaming.
- Ignore stale workflow provider flags; runtime requests cannot call the removed hosted workflow or storage services.
- Keep secrets on the server and out of logs, test output, Git and browser responses.
- Preserve pending/internal student submissions, verified-owner access and public-review rules.
- Reuse the working ECS PostgreSQL database and existing OSS bucket. Do not reseed or write production data during local verification.
- Preserve historical OSS migration mappings/object keys; they identify already-copied files, not runtime provider choices.
- Integrate only the new delta from commit `a38dfe3c277bfad5fd7559194bf56c8489d4eb51`, preserving unrelated dirty source changes.

## Task 1: Shared Qwen API and native entry points

Files: create `src/lib/qwen-config.ts` and tests; modify `src/lib/native-workflow/{model,images,attachments}.ts`, `src/lib/qwen-tts.ts`, `app/api/ai-chat/route.ts`, and `app/api/science-resources/{recognize,generate-cover}/route.ts` with their tests.

Interfaces:
```ts
qwenApiKey(): string;
qwenMultimodalEndpoint(): string;
qwenChatEndpoint(): string;
generateTeachingImage({prompt, ratio, signal}): Promise<{url: string; model: string}>;
extractAttachment(file: File, signal?: AbortSignal, options?: {maxBytes?: number}): Promise<ExtractedAttachment>;
```

- [x] Add failing tests for the shared speech key, supplied host, inexpensive defaults, stale legacy flags, real text/image attachment extraction and honest provider failures.
- [x] Confirm those failures in focused Vitest runs.
- [x] Implement one Qwen configuration and unconditional native chat/recognition/image entry points. Default image model is the supplied supported `qwen-image`; request supported image sizes. Use `qwen-flash`, `qwen3-vl-flash` and existing `qwen3-tts-flash` for other modalities.
- [x] Run focused model/image/speech/API/attachment tests; retain cancellation, secret-safe errors and current stream contracts.

## Task 2: Private OSS upload and durable cover delivery

Files: create `src/lib/oss-upload.ts`, `src/lib/science-upload-client.ts`, tests; modify `src/lib/science-cover-sync.ts`, `src/lib/media-links.ts`, `app/api/media/[...key]/route.ts`, `app/api/student-works/route.ts`, `app/api/science-resources/{route.ts,upload/route.ts}`, and `src/components/ScienceLab.tsx`.

Interfaces:
```ts
persistOssUpload(file: File, options: {folder: string; maxBytes: number}): Promise<{url: string; key: string}>;
uploadScienceMaterial(file: File, folder: "poems" | "stories" | "supporting" | "covers", onProgress: (percentage: number | null) => void): Promise<string>;
persistScienceCoverImage(sourceUrl: string, title: string): Promise<string | null>;
```

- [x] Add failing tests for private ACL, overwrite prevention, size/type/folder rejection, stable media URLs, unauthorized private-file denial and upload failures.
- [x] Replace Blob uploads with server-side OSS uploads; preserve material upload progress and the existing file limits. Public media delivery requires a recorded public resource or approved public work; pending work remains owner/admin only.
- [x] Persist only durable generated covers. Return an explicit unsaved status if OSS/DB fails; never save the provider's expiring URL as a catalog cover.
- [x] Run upload, cover, catalog and media permission tests.

## Task 3: Remove legacy services and active configuration

Files: delete unused legacy transports/download signing helpers and their obsolete provider-only tests; adapt generic result/file parsers and components; update active upload scripts, `package.json`, both lockfiles, `.env.example`, native and speech docs.

- [x] Add regressions rejecting removed provider URLs, keeping native artifact/image output valid and verifying no runtime source imports the removed dependency.
- [x] Replace the legacy download entry with a no-network retired response; keep the native artifact endpoint as the actual document path.
- [x] Remove obsolete client conversation wiring/provider enums, runtime service trust and product setup/error guidance.
- [x] Update active batch upload tools to OSS, retain historical migration data/tools only as archival sources, and uninstall the unused Blob package.
- [x] Run generic parsing/stream/download and active-script checks.

## Task 4: Verify, integrate and document evidence

- [x] Run focused regressions, full applicable source suite, TypeScript, changed-file ESLint and production build with build seeding disabled.
- [x] Make a bounded real-provider smoke using the existing shared key and supplied Qwen host. Verify one real generated image; roundtrip one isolated OSS verification object and delete that exact object afterward. Do not mutate production catalog/work rows.
- [x] Review the delta for lost capabilities, permission regressions and secret exposure. Record actual limits: browser/microphone acceptance and production deployment remain unverified.
- [x] Correct the previous database/Blob-token report in the existing acceptance and migration documents.
- [x] Backup/verify original changed-file hashes, stop only the owned preview session, integrate the reviewed delta, rebuild/restart the local preview and commit the isolated changes.

Final evidence: original source passes 61 files / 545 Vitest tests, 15 CLI tests, TypeScript, 72 changed-file lint checks and a seeded-disabled production build. The 3100 preview passed real native resource/document/voice and private-OSS-delivery checks. Its three historical catalog count failures are unchanged (44/47). The private backup manifest records integration hashes and the isolated source commit. Production deployment, DB writeback and real browser/microphone/playback acceptance are separate outstanding steps.
