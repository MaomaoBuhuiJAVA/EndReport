## Current continuation: shared Qwen + private OSS, 2026-10-10

The user requires all model modalities to use Qwen with the existing speech credential and no hosted legacy workflow/storage services. The supplied API host is `maas.qianwenaiapi.com`. Fresh isolated validation passed 61 files / 545 Vitest tests, 15 CLI private-upload/shared-Qwen/scoped-registration tests, TypeScript and 72 changed-file ESLint checks with zero errors or warnings. The production build passed with seeding disabled. Real-provider verification and focused review are complete; original-source integration and its final verification follow.

Server configuration correction: the existing ECS PostgreSQL and OSS are available. Read-only server queries confirmed 172 knowledge items and 403 resources. Local placeholder DB values do not describe production. New uploads use existing OSS AccessKey credentials and no additional Blob token. No production data was modified. The historical verification log below describes earlier stages, including superseded provider flags and image sizes.

Current models: text/telephone `qwen-flash`, vision `qwen3-vl-flash`, image `qwen-image`, TTS `qwen3-tts-flash` with Mochi. All resolve the existing speech key first. The supplied image example is implemented directly; one generated image per request and no watermark. Active routes are unconditional native routes, with no hosted workflow fallback.

Current live samples: lesson 4442ms; five exact experiment photos 31ms, same-experiment follow-up 22ms; room/profile retrieval about 16ms; vision 4589ms; DOCX/PDF 159/117ms with successful PDF re-upload. Uploaded-poem cover succeeded at an actual 1136×1472, after accepting the observed, exact regional result host. The nominal 1140×1472 request is aligned by the provider; the smoke validator permits up to 8px alignment. The successful saved response/image was revalidated without another paid image call. The model inserted a cartoon child despite the no-people prompt, so image success does not imply perfect semantic adherence.

Current telephone sample: first delta 251ms, first sentence 352ms, text complete 487ms, first-sentence WAV ready 1954ms. This remains HTTP/audio-generation evidence, not actual microphone or playback acceptance. A unique private OSS object was uploaded, read back byte-for-byte, checked for private ACL, deleted, and confirmed absent. Production catalog/work rows were not written.

Focused review fixes: student-work ACL precedes public catalog references, including migrated and encoded filenames; public submissions cannot expose pending work. The old public sync-cover entry returns 410 and cannot persist an expiring provider URL. Bare hall/panorama requests and exact numbered rooms use actual site media; unnumbered grouped requests retain all photos. Scoped batch media registration preserves text, titles, unrelated rows and existing private status, checks ownership before a transaction, and accepts the uploader's exact catalog path. Preview performs no DB access; explicit `--catalog` overrides configured values. All focused regressions pass and the final reviewer reported no remaining findings.

Latest integration preflight: 89 meaningful task paths (19 additions, 62 modifications, 8 removals), zero conflicts against `a38dfe3c277bfad5fd7559194bf56c8489d4eb51`; 8 newline-only paths excluded. Original unrelated changes will remain in place. Existing local OSS credentials are supplemented privately; local writable verification is not pointed at the production database.

# Native Teaching Workflow Progress

Authoritative plan: `2026-10-10-native-teaching-workflow.md`.

2026-10-10: Parsed the supplied DSL (51 nodes, nine task families). Isolated branch: `codex/native-teaching-workflow-20261010`, based on `5ffab25`. The original project's existing changes were snapshotted and preserved. The worktree has independently installed dependencies; it no longer shares a node_modules junction with the original checkout.

Implemented the native API before any legacy Dify upload or invocation, with nine task routes, direct model transport, original prompts/schemas, strict catalog/media retrieval, validated explicit conversation state, real attachment extraction, document generation/downloads, and first-sentence TTS preparation. The latest user requirement supersedes the initial rollback design: every runtime entry now uses the native workflow and shared Qwen API; the legacy provider and hosted Blob dependency are removed.

Document commits: `d5933e5`, `295ec45`, `e188d21`. The last fixes native runtime dependency resolution: Turbopack had replaced direct `require.resolve()` paths with numeric module IDs despite successful builds. Both PDF generation and uploaded PDF parsing now use indirect runtime resolution and explicit asset tracing.

Fresh primary verification:

- `npx vitest run`: 54 files / 486 tests passed; TypeScript passed.
- Changed-file ESLint: zero errors, two existing unused-variable warnings in legacy ai-chat routing.
- `npx next build`: exit 0, no Turbopack warnings. Existing Prisma database URL validation logs remain.
- Real production HTTP: all nine task families passed with available services and synthetic, non-personal inputs. Actual provider responses identify `native`.
- DOCX/PDF/PPTX/XLSX downloads contain their actual file structures. A downloaded PDF was uploaded to the production API and its Chinese text was recovered.
- Real Qwen illustration: 1536 × 1536; uploaded-poem cover: 1536 × 2048. The live provider uses the exact `dashscope-0484.oss-accelerate.aliyuncs.com` result host, now accepted alongside the existing result buckets.
- Resource lookup returned five photos for “生气的河豚”; follow-up video stayed on that experiment. New explicit titles replace the previous title, with regression coverage for all supported quotation forms.
- Latest telephone HTTP sample: first delta 264 ms, first complete sentence 367 ms, text complete 490 ms, first-sentence WAV ready 2033 ms. These are single local measurements, not a microphone or playback quality claim.

Code review found and fixed explicit-title replacement and interrupted audio playback settlement. Regression tests were observed failing before fixes. Turning off the speaker now cancels the queue and lets the current text turn finish before recognition resumes, preventing overlapping turns and unresolved playback waits.

The Node source-regex contract tests contain existing failures on obsolete UI source shapes (upload sizing, image normalization and click handlers). They are not substituted for behavioral tests; baseline comparison confirmed several failures predate this task. No claim is made that every legacy source-shape assertion passes.

Additional science catalog regression: the untouched original checkout has three existing failures against historical 24-experiment/image/QR counts (44 / 47 pass). The isolated worktree adds one filesystem-root expectation failure because its nested location resolves a different source-layout fallback (43 / 47 pass). The affected catalog, tests and layout implementation are outside this migration's delta. Record these separately from the green Vitest suite.

Implementation choices: deterministic attachment/task rules avoid an extra remote classification roundtrip; ordinary ambiguous questions use the general chat route. Catalog preparation uses existing database/static-fallback helpers without caching private query results. Vision evidence is read before its dependent retrieval and structured task generation.

Integration preflight: all existing target files match the snapshot, with no substantive conflicts. Three apparent blob-hash differences were caused by Git newline handling; direct byte comparison confirmed equality. Back up targets before copying only this task's reviewed delta. Preserve original environment files, unrelated source changes, and both independent workspaces.

Integration completed: copied 53 task files into `E:/国科二幼/EndReport/robot-console`, with 16 pre-existing targets backed up at `E:/国科二幼/output/native-workflow-backup-20261010-0148/` and 37 new files. A JSON manifest records before/after SHA-256 hashes and newly added paths. Original environment files and unrelated edits were preserved. Dependency installation did not change the synchronized lockfile; Prisma client regeneration completed.

Original checkout verification: 54 files / 486 Vitest tests passed, TypeScript passed, production build exit 0 without Turbopack warnings. HTTP `/` returned 200; `/api/ai-chat` selected native; “生气的河豚” returned five step images and an explicit quoted change selected “玩转纸片”. DOCX and PDF downloads succeeded (9782 and 51363 bytes in the integration sample). The original checkout's production preview remains at `http://127.0.0.1:3100/`; this is a local preview, not a production deployment.

Remaining external acceptance: browser control is blocked by saved permission verification; do not bypass it. Microphone/recognition/audio playback require a real supported browser. The configured local DATABASE_URL does not match the PostgreSQL schema, so cover synchronization and feedback database writes have not been runtime verified. Production deployment and persistent-volume configuration have not been performed.

Usage/configuration: `docs/native-teaching-workflow.md`; format/storage limits: `docs/native-teaching-documents.md`. Local provider evidence and generated samples are ignored under `tmp/native-workflow-smoke/`; private artifacts/signing keys are ignored under `.ai-artifacts/`.

## Post-1064 acceptance fixes, 2026-10-10

The initial implementation was already integrated. This continuation compares only its new delta against `1064c8f`, never against the older `5ffab25` snapshot.

Implemented and regression verified:

- Single-character science themes must match; authoritative topic matches exclude incidental words in unrelated poems. School prefixes and quoted school template titles no longer replace the actual science topic.
- Explicit topic changes replace the old topic while preserving age, semester and delivery filters. Category-only changes keep the previous topic. Explicit titles and media changes retain their existing behavior.
- School/room requests use actual profile, room photos and public document summaries with bounded existing fallbacks. Unknown rooms cannot substitute another room; internal staff/roster and device records are excluded.
- Missing output formats retain evidence and distinguish reusing completed text from generating a pending request/revision. Vision evidence is read before a format question. Pure exports, including parent activity recaps, preserve the exact completed text and skip new model/science/site retrieval.
- JSON/multipart `documentUrl` and natural document-link requests actually download and extract public HTML/TXT/Office/PDF content. DNS destinations and redirects are checked and pinned; title/main text, time/size limits and unreadable-source errors are covered. `cheerio@1.1.2` is loaded only for remote extraction.
- Plain extraction, summary, rewriting and parent activity recaps use ordinary requested text. Explicit diagnosis/check requests retain the structured diagnostic card. Ordinary document delivery excludes unrelated catalog sources; library enrichment requires an explicit request.
- Requested reading guidance supplements unchanged, real poem content with one model call. Ordinary catalog/media delivery remains deterministic.
- Full lessons take precedence over an incidental activity-reflection field; image observation reports/XLSX are distinct from image generation; source URL file extensions do not request output formats; negative cover wording does not turn a PPT request into image generation.

Fresh source-only isolated verification: 57 Vitest files / 563 tests passed with `npx vitest run --exclude 'tmp/**'`; TypeScript passed. The earlier 58-file / 654-test result included 95 duplicate tests from an ignored integration snapshot, so it is not the source-suite count. Changed-source ESLint has zero errors and two pre-existing legacy unused-variable warnings. Full lint also passed, with those warnings duplicated in that snapshot. Diff whitespace verification uses `core.whitespace=cr-at-eol` for the npm-generated Windows lockfile.

Real HTTP/provider report now has 19 canonical case IDs and no remaining failed latest results. New checks include exact water poems and water-to-wind continuation, correct school rooms/profile, reading guidance, two-turn parent recap/DOCX with identical text and empty unrelated resource fields, real Example Domain正文 plus exactly three Chinese summary sentences, full school lesson form, and a downloaded PPTX with exactly 10 actual slide XML files. DOCX/PDF download and PDF-upload roundtrip, explicit diagnostic card, and the earlier nine task families also succeeded.

Latest selected timings on the isolated local production server: reading guidance 1423 ms, parent recap 876 ms, its unchanged DOCX export 156 ms, URL extraction/summary 1431 ms, DOCX export 51 ms, PDF export 127 ms, explicit document diagnosis 17585 ms. These are individual samples. One diagnosis attempt returned invalid model JSON and a recoverable error; the same-input direct model check and API retry produced valid results. Do not characterize model output as infallible.

Earlier real image verification remains: landscape illustration 2048 × 1152, uploaded-poem cover 1536 × 2048. Latest prior telephone HTTP sample: first delta 289 ms, first sentence 399 ms, text complete 519 ms, WAV ready 2377 ms; no actual microphone or playback acceptance claim.

Focused read-only review identified topic/category continuation and the pure-export resource-enrichment path; both were reproduced failing, fixed and rechecked. No material findings remained in that focused review.

Second integration copied 21 delta files (16 backed up, 5 new) after verifying the original targets against 1064 and checking all copy hashes. Backup: `E:/国科二幼/output/native-workflow-delta-backup-20261010-031753/manifest.json`. Original dependencies installed and Prisma regenerated; package/lockfile hashes stayed identical to reviewed source. npm reported 39 existing dependency advisories (11 moderate, 26 high, 2 critical); no unrelated or breaking audit fixes were applied.

Original verification before the final extraction fix: 57 files / 559 source tests passed, TypeScript and production build passed, changed-source ESLint zero errors/two legacy warnings, home HTTP 200. Real original API passed lesson, experiment and school media, exact resource matching/continuation, parent recap with unchanged DOCX, format clarification/PDF, DOCX/PDF/PDF roundtrip, ten-slide PPT and voice. Latest original telephone sample: first delta 221 ms, first sentence 309 ms, text complete 435 ms, WAV ready 2511 ms. No microphone/playback claim.

The original URL acceptance exposed a model omitting the real page title, despite extraction having preserved it. The final fix makes explicit plain正文/全文 extraction deterministic, skips the model for pure extraction, and asks the model only for a requested supplement. Raw source is emitted/preserved before summary generation and becomes part of the draft/export. Two regressions were observed failing before this fix and then passed. Explicit deletion/anonymization requests bypass the verbatim path and use normal document editing; its synthetic-name regression was observed failing before the guard fix. A failed-summary regression confirms preservation of complete original text. The source suite is now 563 tests. Final original verification follows. External configuration/device/deployment gaps above remain open; the overall goal is active.

Final original verification completed: 57 source files / 563 tests passed; TypeScript, final production build and changed-file lint passed. The latest URL smoke (3755 ms) now asserts the entire extracted evidence occurs verbatim in the reply, retains Example Domain and exactly three Chinese summary sentences. Actual pure TXT extraction plus Word export preserved every source line, returned native, and downloaded a 9750-byte DOCX. The original merged report has 10 canonical latest cases, all successful after URL recheck; earlier isolated verification covers the remaining task families and image generation.

The original production preview is running at `http://127.0.0.1:3100/`. The obsolete isolated preview was stopped. This is a local preview only. The final copy hashes and source commit are recorded in the second backup manifest; original environment files, signing secrets and unrelated edits were preserved. Browser/device, database writeback and production/persistent-storage acceptance remain open, so the overall goal is not marked complete.

## Shared Qwen/OSS original-source integration, 2026-10-10

Integrated only 89 meaningful task paths from `a38dfe3`, including 19 additions and 8 retired-source removals. Existing source, local environment and the two external reports were privately backed up before mutation; every copy/removal was hash-verified, and 207 unrelated dirty/untracked original files retained their hashes. Backup: `E:/国科二幼/output/native-qwen-oss-backup-20261010-080530-ae794b/manifest.json`. This local integration did not Git-merge, reset or stash the dirty original checkout.

Existing OSS credentials were supplemented into original `.env.local`; the original PostgreSQL placeholders, production-local configuration, signing secret and other environment values were preserved. Dependencies were synchronized and Prisma regenerated. npm changed only lockfile newline formatting, with identical JSON dependency content; the reviewed bytes were restored. No database seeding or schema push was run.

Fresh original verification: 61 files / 545 Vitest tests, 15 CLI tests, TypeScript and 72 changed-source ESLint checks passed with zero lint warnings. The original production build passed with both seed flags explicitly disabled. Legacy `test:science` is 44/47, reproducing exactly the three baseline count failures; the isolated source-layout difference is absent in the original location.

The original preview is ready at `http://127.0.0.1:3100/`, with home HTTP 200. Real original API checks passed experiment resources/follow-up, site resources, actual Word/PDF downloads, PDF re-upload, and telephone text/TTS. Original samples: resources 104ms on the first request and follow-up 29ms; room/profile 9/14ms; Word/PDF 157/115ms; telephone first delta 153ms, first sentence 306ms, text complete 386ms, first-sentence WAV ready 2015ms. Direct additional checks read real hall/panorama/numbered-corridor WebP files, confirmed both retired endpoints return 410, and denied an unregistered student-work object.

Actual existing private OSS media delivery through the original site's `/api/media/…` succeeded: a public catalog cover returned 200 with the correct WebP structure and 29036 bytes. All 28 legacy service URLs in the static science catalog are mapped to existing OSS paths. No extra paid image generation was used for original integration acceptance. The isolated 3101 preview was stopped; the original 3100 preview remains running.

The previous missing-PostgreSQL/Blob-token report has been corrected in both external acceptance/evaluation reports. Source commit and final integrated hashes are recorded in the private backup manifest. Only local source and environment were changed; production deployment, production catalog/work writeback, browser/device acceptance and restart-persistent artifact storage remain open. The overall goal remains active without the stale credential blocker.

## Final PPT/link corrections and reviewed release candidate, 2026-10-10

The eight source paths correct explicit total slide parsing, section/ordinal exclusions, follow-up bounds, requested-topic title merging, rendered-count validation, and generated-site-link normalization. Reused/uploaded source drafts are never normalized. Independent review verified full text and notes preservation and rejection of mismatched presentations before storage.

Latest original and isolated verification: 62 files / 585 tests passed; final eight-file lint has zero warnings, and the original production build passed with both seed flags disabled. The real failed Qwen presentation replay now renders ten slides retaining all eleven source lines without another model request. A fresh Qwen ten-page presentation and 1664x928 illustration had already passed API checks; the illustration adds English despite a no-text instruction, so semantic teacher review remains necessary.

The local server-source candidate builds standalone with one build worker and passes 62 files / 584 tests. Its one-test difference deliberately preserves the production media adaptation instead of adding an unrelated pre-baseline MIME fallback. Chinese font and PDF worker assets are present in the standalone runtime.

The original preview was restarted at http://127.0.0.1:3100/. Its 11-item deterministic HTTP suite passed: native greeting, exact resources and follow-up, numbered room and real WebP, existing private-OSS public-video Range, real four-format file bytes/content and preserved source URL, the ten-slide replay, retired/private boundaries, and the same pre-restart DOCX downloaded with an identical hash after restart. No paid model calls or database writes were made for this suite.

The locally prepared release bundle is E:/国科二幼/output/deploy/native-qwen-oss-20261010. It contains cumulative source changes reconciled with production, 113 task paths including eight retirements, a full 208-file source inventory, nonsecret support hashes, exact upload-gateway restoration, stable private artifact storage, and guarded Linux stage/activate/rollback operations. Fifteen local operations tests pass, including failure recovery, retry, concurrent-change refusal and inventory guards. Windows replaces only the test fixture's atomic directory-symlink primitive; the actual Linux primitive and cgroup/server acceptance remain pending. Remote staging and production activation have not occurred.

Source/schema/unit/proxy inventories and effective shared Qwen key were read-only verified on the pinned SSH host. Production uses /etc/guoke/runtime.env plus /etc/guoke/qwen-tts.env; the new zz-native-workflow.conf will load model selection last while retaining the existing key. No new Blob/STS token is required.

Browser permission refusal has not been bypassed. Production catalog/work writeback, device microphone/recognition/playback, and the authorized online switch remain open. The overall goal stays active. Earlier counts and timings above are historical checkpoints; this section records the latest state.

## Telephone silent-player correction, 2026-10-10

The focused telephone audit confirmed that the user-gesture audio unlock sets volume to zero and reuses that element for speech without restoring volume. Extracted the existing clip configuration into prepareSpeechAudio, observed both speaker-state regressions fail with expected 1 / received 0, then restored volume before assigning the real clip. Speaker mute remains explicit; gesture unlocking, hangup, microphone mute and cancellation behavior are unchanged.

Fresh isolated and original verification: 62 files / 588 tests, TypeScript and three-file ESLint passed with zero warnings. The original production build passed with both seeds disabled. The server-source candidate passed 62 files / 587 tests and its one-worker standalone build; Chinese font and PDF worker are present. The one-test source-location difference remains the preserved server MIME adaptation.

The original preview at http://127.0.0.1:3100/ was rebuilt and restarted. Compiled client output contains the restoration. All 11 deterministic HTTP checks passed again, including the identical pre-restart DOCX hash, with zero model calls or database writes. Independent review found no new Critical, Important or Minor issue. The three-file local integration has a private backup and verifies unrelated dirty paths and environment files before/after copying.

The reviewed release package will include these same three files and this evidence. No production upload, staging, deployment, restart or database write is authorized yet. Real device microphone, recognition, playback and production writeback remain outstanding. Do not retry another browser channel to bypass the saved-permission rejection. The overall goal stays active pending the existing deployment question.
