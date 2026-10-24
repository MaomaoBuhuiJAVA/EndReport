# Native documents implementation report

## Implemented files

- `src/lib/native-workflow/attachments.ts` and `attachments.test.ts`: actual TXT/DOCX/PDF/PPTX/XLSX/DOC/XLS extraction; validated image data URLs including BMP; cancellation and explicit unsupported formats.
- `src/lib/native-workflow/documents.ts` and `documents.test.ts`: real four-format files preserving arbitrary Chinese content, Word lists and tables, embedded Chinese PDF font, table pagination, PPT order/notes/continuations/editable tables, actual spreadsheet tables.
- `src/lib/native-workflow/artifacts.ts` and `artifacts.test.ts`: persistent private filesystem storage, independent persistent HMAC key fallback, opaque signed URLs, ~24h expiry, bounded storage, process-safe writes, cross-process reads, cancellation and tampering rejection.
- `app/api/ai-chat/artifact/route.ts` and `route.test.ts`: generic safe GET download responses and real file bytes with UTF-8 filenames/private headers.
- `package.json`, `package-lock.json`, `pnpm-lock.yaml`: independent document dependencies and synchronized locks.
- `docs/native-teaching-documents.md`: exact support boundaries, storage config, multi-instance limitation, and production font/PDF.js tracing configuration.
- `docs/superpowers/plans/native-documents-brief.md`: task requirements retained with this report.

## Verification evidence

TDD: initial 18 behavioral tests failed against explicit unimplemented interfaces; route's initial three tests likewise failed before implementation. Subsequent red/green cycles covered Word numbering, native PPT tables, BMP/HEIF explanations, absolute PPT relationship references, blank spreadsheet/presentation rejection, forged ZIP sizes, and PDF table pagination.

Final all-project run at 01:07:47 (test output clock): `npx vitest run` → **51 files / 459 tests passed**, exit 0, including concurrent main-agent additions and the production-tracing follow-up changes. The component suite contains **35 tests**, including persisted-storage capacity/oldest eviction. `npx eslint` for all eight owned TS files passed. `npx tsc --noEmit --incremental false` passed after generating Prisma's client for the independent dependency installation. `pnpm import` synchronized the repository's existing secondary lock; `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts` passed with supply-chain policy verification and without modifying independent npm modules.

Rendering evidence lives outside the worktree at `C:/Users/Administrator/AppData/Local/Temp/native-document-smoke/`: actual two-page Chinese PDF rendered by `pdftoppm`; actual PPTX converted by installed LibreOffice and rendered by `pdftoppm`; both pages of both documents visually checked for Chinese glyphs, ordered headings/content, tables and clipping. LibreOffice also converted DOCX to real Word 97 DOC and `extractAttachment` recovered first- and last-page Chinese content. No files/URLs are fabricated. Tests verify actual fresh OS-process artifact reads, rather than only module cache resets.

One discovered Windows-only PDF.js issue (trailing `\\` instead of `/` for CMap paths) was fixed and followed by the successful full 451-test run. PDF tables containing 2500+ Chinese characters now span visible pages; the regression test checks all text positions and content counts.

## Dependencies and packaging

Verified and removed **only** the worktree's `node_modules` Junction to original workspace; independent npm install is complete. Added `docx`, `pdfkit`, `pdfjs-dist@5.4.624`, `pptxgenjs`, `fast-xml-parser`, `@embedpdf/fonts-sc`, direct `sharp`, `bmp-js` and associated typings. Existing `jszip`, `mammoth`, `word-extractor` and `xlsx` are reused. The OFL Chinese font is a real shipped npm asset, so Linux does not require Windows fonts. `npm run prisma:generate` repaired generated dependencies after npm skipped gated installation scripts.

Parent owns integration of the exact `serverExternalPackages` and `outputFileTracingIncludes` recommendations already sent; full config appears in `docs/native-teaching-documents.md`. Production build/standalone smoke validation remains the main agent's integration step. Keep Regular OTF, PDF.js worker, CMaps and standard fonts in standalone output. PDF.js accepts local forward-slash paths on Windows/Linux.

Production build follow-up completed: the remaining warnings were reproduced with real `npx next build`. Resolving the PDF.js ESM entry with `require.resolve()` still triggered Turbopack's CommonJS externalization check even with an ignore comment. The implementation now resolves only `pdfjs-dist/package.json`, joins the ESM entry path, and imports its absolute file URL natively. For storage, ignoring only the root directory expression did not prevent dynamic descendant path joins from tracing the whole project. The default now explicitly scopes to `.ai-artifacts`, while all runtime private-file path joins/reads have targeted Turbopack ignore annotations. No global warning filter was added.

Final `npx next build` completed with exit 0 and **zero Turbopack warnings**. The artifact route's generated NFT manifest contains 301 files and does not contain `next.config.ts`; ai-chat's NFT manifest includes the PDF.js ESM entry and the Chinese Regular OTF. Unrelated existing Prisma URL-validation logs remain because this environment's configured database URL does not match its PostgreSQL schema. Latest full regression at 01:22:14: **53 files / 473 tests passed**. Owned ESLint and full TypeScript checks also passed. Parent continues live production API/flow verification; exact tracing includes remain documented above.

`npm install` reported 39 full dependency-tree advisories (11 moderate, 26 high, 2 critical). `npm audit --omit=dev` reported 34 production-tree advisories (8 moderate, 24 high, 2 critical). Notable existing document dependency advisories include SheetJS `xlsx` and `mammoth`; new `pptxgenjs` transitively uses advisory-affected `image-size`. This implementation does not call PPT image import/remote image loading. No force-upgrade of unrelated dependency tree was attempted.

## Configuration gaps and bounded behavior

- Set `AI_ARTIFACT_DIR` to a private persistent volume directory in production. Set identical `AI_ARTIFACT_SECRET` (32+ chars) on multiple instances; they also need the same shared storage. A local generated secret survives restart only while the entire volume survives. Ephemeral/serverless disk and multi-instance unshared disk do not provide persistence. Object storage is not yet implemented.
- Artifacts expire after ~24h, capped at 20MB each / 128 files / 256MB total; oldest valid files can be evicted early at capacity. Expired/orphan files are pruned on next write.
- Old PPT has a clear PPTX conversion error. HEIC/HEIF has a clear PNG/JPEG conversion error because the installed cross-platform image decoder does not ship the required HEIF codec. BMP supports uncompressed standard 40-byte bitmap headers; other encoding is explicit conversion error.
- No OCR for scanned PDFs, spreadsheet formula calculation, or macro/animation execution. DOC/DOCX extract body text, which is the existing parser capability; arbitrary visual artwork is not transcribed. PPT speaker notes support the documented heading conventions.
- Input: 4MB, 50000 text chars with explicit truncation notice, ZIP 2000 entries / 16MB per entry / 32MB expansion. Actual bounded inflation also verifies declared sizes. Very wide PDF tables fail with an explanatory split-table error, rather than crop content.
- Generation APIs have the exact required signatures; cancellation is honored by APIs exposing a signal (attachment extraction, artifact read, GET request). The caller must discard document generation if its workflow is cancelled since the required three-argument generation API carries no signal.

No other agents' source files were changed or reset. No deployment/publication performed.
