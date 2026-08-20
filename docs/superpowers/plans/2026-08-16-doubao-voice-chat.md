# 科小贝豆包语音播报与实时通话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有资料库检索、DeepSeek 文字对话和实验详情跳转的前提下，为科小贝增加豆包 `x4_doudou` 语音播报，以及可结束、可静音、可降级的半双工语音通话，并先在本地完成验收。

**Architecture:** 服务端新增短生命周期的 `/api/voice/tts` 路由，凭借服务端环境变量连接豆包双向 TTS WebSocket，返回 `audio/mpeg`。客户端继续用浏览器 `SpeechRecognition` 做中文识别；回复气泡播报与通话播报共用一个可取消的音频播放器。连续通话使用独立识别器和会话编号，按“聆听 -> 请求文字回复 -> 播报 -> 聆听”循环，任何语音失败都回退到文字输入。

**Tech Stack:** Next.js App Router route handler, TypeScript, React 19 client component, browser SpeechRecognition and HTMLAudioElement, Vitest, Node WebSocket/undici。

---

### Task 1: Define TTS protocol boundary and failing unit tests

**Files:**
- Create: `robot-console/src/lib/doubao-tts.ts`
- Test: `robot-console/src/lib/doubao-tts.test.ts`

- [ ] **Step 1: Write failing tests for configuration and frame parsing**

  Cover: server-only env configuration requires all four credentials, the default voice is `x4_doudou`, binary audio frames are collected in order, JSON error frames reject, and no credential value is included in an error.

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run from `E:\国科二幼\EndReport\robot-console`:

  ```powershell
  npm test -- --run src/lib/doubao-tts.test.ts
  ```

  Expected: FAIL because the TTS module and exported protocol helpers do not yet exist.

- [ ] **Step 3: Implement the smallest injectable Doubao client**

  Define a `DoubaoTtsConfig`, `DoubaoTtsClientOptions`, and `synthesizeDoubaoSpeech(text, options?)` boundary. Read only `DOUBAO_API_KEY` and optional `DOUBAO_TTS_RESOURCE_ID` on the server. Connect to `wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream` with `X-Api-Key` and `X-Api-Resource-Id`, send the official `SendText` binary frame, collect only event `352` audio payloads, verify completion event `152`, then close on success/failure/timeout and return one `Buffer`.

- [ ] **Step 4: Run the focused tests and refactor only after green**

  Run the same command; expected PASS with no credential values in thrown messages. Keep protocol parsing pure enough for deterministic tests.

### Task 2: Add the TTS route and route tests

**Files:**
- Create: `robot-console/app/api/voice/tts/route.ts`
- Test: `robot-console/app/api/voice/tts/route.test.ts`
- Modify: `robot-console/.env.example`

- [ ] **Step 1: Write failing route tests**

  Assert empty or non-string text returns `400`, missing configuration or upstream failure returns `503` JSON, and a successful injected synthesis returns `200` with `Content-Type: audio/mpeg` and `Cache-Control: no-store`. Assert the response body never contains configuration values.

- [ ] **Step 2: Run the route tests and verify they fail for the missing route**

  ```powershell
  npm test -- --run app/api/voice/tts/route.test.ts
  ```

- [ ] **Step 3: Implement the route**

  Parse JSON safely, trim and bound text to a reasonable server limit, call the TTS client, and map all provider/configuration errors to the stable Chinese-safe `503` response. Keep the route on the Node runtime and never log request text or credentials.

- [ ] **Step 4: Add blank server-only env names and rerun tests**

  Add blank server-only `DOUBAO_API_KEY` and optional `DOUBAO_TTS_RESOURCE_ID` names to `.env.example`. Run the focused route tests and the TTS unit tests; expected PASS.

### Task 3: Extract and test cancellable client voice behavior

**Files:**
- Create: `robot-console/src/lib/voice-session.ts`
- Test: `robot-console/src/lib/voice-session.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

  Cover `listening -> thinking -> speaking -> listening`, muted sessions not restarting recognition, ended sessions ignoring late AI/TTS results, and a new playback stopping the previous audio.

- [ ] **Step 2: Run the focused state tests and verify RED**

  ```powershell
  npm test -- --run src/lib/voice-session.test.ts
  ```

- [ ] **Step 3: Implement pure session guards and cleanup helpers**

  Use a monotonically increasing session id plus `AbortController` references. Export only small helpers for validity checks, final-result extraction, and stopping/revoking an audio resource so the React component does not duplicate cancellation rules.

- [ ] **Step 4: Run focused tests and keep them green**

  Run the state tests again; expected PASS.

### Task 4: Extend SciencePet with copy, TTS playback, and phone mode

**Files:**
- Modify: `robot-console/src/components/SciencePet.tsx`
- Modify: `robot-console/src/components/SciencePet.contract.test.mjs`

- [ ] **Step 1: Extend the contract test before implementation**

  Assert `Copy`, speaker, and phone controls exist; only assistant messages render the action row; the call panel exposes listening/thinking/speaking/muted states; the existing press-and-hold recognition handlers remain; and close/unmount routes through voice cleanup.

- [ ] **Step 2: Run the contract test and verify it fails**

  ```powershell
  node --no-warnings --test src/components/SciencePet.contract.test.mjs
  ```

- [ ] **Step 3: Implement shared assistant request and assistant actions**

  Extract the existing `/api/ai-chat` request into a function that returns the reply plus `photos`/`labLinks`, then keep normal send behavior unchanged. Add copy feedback using full plain reply text. Add one shared `HTMLAudioElement` playback path: request `/api/voice/tts`, create/revoke the Blob URL, toggle stop on second click, and show a short non-blocking “语音暂时不可用” notice on failures.

- [ ] **Step 4: Implement the independent call state machine**

  Add a `CallPhase` state and separate `callRecognitionRef`. On phone click, stop press-and-hold input, start Chinese continuous recognition, process only final result text, stop recognition before each AI request, call the shared AI request, then TTS and playback. Resume listening only if the session is still active and not muted. Add mute, end-call, and close controls; all of them invalidate the session, abort requests, stop audio, and clear recognition callbacks.

- [ ] **Step 5: Run the contract test and TypeScript check**

  ```powershell
  node --no-warnings --test src/components/SciencePet.contract.test.mjs
  npx tsc --noEmit
  ```

  Expected: PASS. Fix implementation issues rather than weakening assertions.

### Task 5: Style the action row and full-size call overlay

**Files:**
- Modify: `robot-console/app/globals.css`

- [ ] **Step 1: Add focused CSS assertions to the contract test**

  Assert assistant action buttons have a stable compact row, the call surface is an in-chat full-size overlay with `min-height: 0`, and the mobile media query preserves the safe-area height and does not create horizontal overflow.

- [ ] **Step 2: Implement responsive styles**

  Add styles for action labels/icons, playback active state, call status, transcript/reply preview, mute/end controls, and the mobile overlay. Keep existing chat composer and message scroll behavior intact; do not nest decorative cards inside the call surface.

- [ ] **Step 3: Run contract and lint checks**

  ```powershell
  node --no-warnings --test src/components/SciencePet.contract.test.mjs
  npm run lint
  ```

### Task 6: Full local verification and handoff

**Files:**
- No source changes unless a verification failure requires a targeted fix.

- [ ] **Step 1: Run the complete automated suite**

  ```powershell
  npx tsc --noEmit
  npm run lint
  npm test -- --run
  npm run test:science
  npm run build
  ```

- [ ] **Step 2: Start a fresh local server**

  Stop any stale Next process, then run `npm run dev -- --webpack` from the app root. Use the first free local port and report the exact URL. Do not run Git, Vercel, deployment, or commit commands.

- [ ] **Step 3: Browser-check the target flow**

  The flow under test is: home page -> open 科小贝 -> assistant reply -> copy/speaker actions -> phone button -> microphone state -> mute/end/close cleanup. Check desktop and a narrow mobile viewport, including unsupported/denied microphone fallback, and record console errors or remaining credential prerequisites.

- [ ] **Step 4: Hand off local preview only**

  Report changed files, test commands/results, local URL, and the one prerequisite for real `x4_doudou` playback: configure local `DOUBAO_API_KEY` and, when needed, `DOUBAO_TTS_RESOURCE_ID`. Explicitly state that no commit, push, or deployment was performed.
