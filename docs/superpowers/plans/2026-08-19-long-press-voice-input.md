# Long-Press Voice Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first press-and-hold voice-input overlay to 科小贝 while preserving browser speech recognition, draft-text handoff, and explicit message sending.

**Architecture:** `SciencePet.tsx` owns the new pointer-cancel state and reuses its existing `SpeechRecognitionLike` lifecycle. A fixed overlay is rendered only while a hold is active or transcription is finishing, and CSS supplies its waveform and responsive visual layout. The existing voice feedback line remains the source of textual error and completion notices.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Lucide React, Node contract tests.

---

### Task 1: Lock The Overlay Contract With Tests

**Files:**
- Modify: `robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs`
- Test: `robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs`

- [ ] **Step 1: Add a failing contract test for recording state and cancellation**

Append this test after the existing press-and-hold composer tests:

```js
test("shows a hold-to-talk overlay and discards recognition after a leftward cancel gesture", () => {
  assert.match(component, /const \[voiceCancelPending, setVoiceCancelPending\] = useState\(false\)/);
  assert.match(component, /function updateVoiceCancelTarget\(clientX: number\)/);
  assert.match(component, /onPointerMove=\{handleVoicePointerMove\}/);
  assert.match(component, /voiceCancelPending \? " is-cancel-pending" : ""/);
  assert.match(component, /recognition\.abort\(\)/);
  assert.match(component, /setInput\(voiceBaseInputRef\.current\)/);
  assert.match(component, /className="pet-voice-hold-overlay"/);
  assert.match(component, />松手转文字</);
  assert.match(component, /pet-voice-hold-overlay__target--cancel/);
  assert.match(component, /pet-voice-hold-overlay__target--confirm/);
});
```

- [ ] **Step 2: Run the new test and verify it fails because the overlay contract is absent**

Run:

```powershell
node --test src/components/SciencePet.inplace-actions.contract.test.mjs
```

Expected: FAIL with a missing `voiceCancelPending` or `pet-voice-hold-overlay` match.

- [ ] **Step 3: Add a failing responsive-style contract test**

Append this test:

```js
test("keeps voice hold targets above mobile safe areas and disables motion when requested", () => {
  assert.match(styles, /\.pet-voice-hold-overlay\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?z-index:\s*\d+/);
  assert.match(styles, /\.pet-voice-hold-overlay__targets\s*\{[\s\S]*?padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom\)[^;]*\);/);
  assert.match(styles, /\.pet-voice-hold-overlay__target\s*\{[\s\S]*?min-height:\s*56px;/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pet-voice-hold-overlay__wave span[\s\S]*?animation:\s*none;/);
});
```

- [ ] **Step 4: Run the test again and verify both new contracts fail**

Run:

```powershell
node --test src/components/SciencePet.inplace-actions.contract.test.mjs
```

Expected: FAIL with the new overlay and responsive-style contract assertions, while unrelated existing tests remain green.

- [ ] **Step 5: Commit the red test**

```powershell
git add -- robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs
git commit -m "test: specify long press voice overlay"
```

### Task 2: Add Pointer-Cancel Recognition State And Overlay Markup

**Files:**
- Modify: `robot-console/src/components/SciencePet.tsx:380-442`
- Modify: `robot-console/src/components/SciencePet.tsx:1501-1618`
- Modify: `robot-console/src/components/SciencePet.tsx:2033-2181`
- Test: `robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs`

- [ ] **Step 1: Add minimal state and refs beside the existing composer voice state**

Add the following next to `voiceStatus` and the existing recognition refs:

```ts
const [voiceCancelPending, setVoiceCancelPending] = useState(false);
const voiceStartXRef = useRef(0);

function updateVoiceCancelTarget(clientX: number) {
  const shouldCancel = clientX < voiceStartXRef.current - 72;
  setVoiceCancelPending(shouldCancel);
}
```

- [ ] **Step 2: Make the start lifecycle establish the hold and input snapshot**

At the beginning of `startVoiceInput`, after pointer capture, initialize the hold state:

```ts
voiceStartXRef.current = event.clientX;
setVoiceCancelPending(false);
voicePressedRef.current = true;
voiceBaseInputRef.current = input.trim();
voiceTranscriptRef.current = "";
```

Keep all current recognition constructor, `zh-CN`, interim result, and error mapping code unchanged.

- [ ] **Step 3: Add a pointer-move handler and cancellation branch**

Add these functions next to `stopVoiceInput`:

```ts
function handleVoicePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
  if (!voicePressedRef.current) return;
  updateVoiceCancelTarget(event.clientX);
}

function cancelVoiceInput(event: ReactPointerEvent<HTMLButtonElement>) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  voicePressedRef.current = false;
  setVoiceCancelPending(false);
  setInput(voiceBaseInputRef.current);
  voiceTranscriptRef.current = "";
  const recognition = recognitionRef.current;
  if (recognition) recognition.abort();
  setVoiceStatus("idle");
  setVoiceNotice("已取消本次语音输入。");
}
```

At the start of `stopVoiceInput`, branch to `cancelVoiceInput(event)` when `voiceCancelPending` is true. Otherwise retain the current `processing`, notice, and `recognition.stop()` path.

- [ ] **Step 4: Render the overlay inside the idle-call chat branch before the composer**

Render only during a press or transcript finalization:

```tsx
{(voiceStatus === "starting" || voiceStatus === "listening" || voiceStatus === "processing") ? (
  <div className={`pet-voice-hold-overlay${voiceCancelPending ? " is-cancel-pending" : ""}`} role="status" aria-live="polite">
    <div className="pet-voice-hold-overlay__bubble">
      <span className="pet-voice-hold-overlay__wave" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((bar) => <span key={bar} />)}
      </span>
      <span>{voiceStatus === "processing" ? "正在转写" : voiceCancelPending ? "松手取消" : "松手转文字"}</span>
    </div>
    <p className="pet-voice-hold-overlay__hint">{voiceCancelPending ? "松手取消录音" : "松手转文字"}</p>
    <div className="pet-voice-hold-overlay__targets" aria-hidden="true">
      <span className="pet-voice-hold-overlay__target pet-voice-hold-overlay__target--cancel">取消录音</span>
      <span className="pet-voice-hold-overlay__target pet-voice-hold-overlay__target--confirm">松手后转文字</span>
    </div>
  </div>
) : null}
```

- [ ] **Step 5: Connect the existing hold button to the new lifecycle**

Keep the existing start and stop handlers, and add movement/cancel handling:

```tsx
onPointerCancel={cancelVoiceInput}
onPointerDown={startVoiceInput}
onPointerMove={handleVoicePointerMove}
onPointerUp={stopVoiceInput}
```

Do not call `sendMessage` from any recognition callback. `onresult` must only continue to call `setInput` with the recognized text.

- [ ] **Step 6: Run the contract test and verify the interaction contract passes**

Run:

```powershell
node --test src/components/SciencePet.inplace-actions.contract.test.mjs
```

Expected: PASS for the new tests and all pre-existing contract tests.

- [ ] **Step 7: Commit the component behavior**

```powershell
git add -- robot-console/src/components/SciencePet.tsx robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs
git commit -m "feat: add long press voice input controls"
```

### Task 3: Style The Mobile Overlay And Verify The Full Flow

**Files:**
- Modify: `robot-console/app/globals.css:3489-3578`
- Modify: `robot-console/app/globals.css:4260-4370`
- Test: `robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs`

- [ ] **Step 1: Add the overlay, bubble, waveform, and drag-target styles**

Add these scoped rules near the composer styles:

```css
.pet-voice-hold-overlay {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: grid;
  grid-template-rows: 1fr auto auto;
  align-items: end;
  background: rgb(12 24 20 / 64%);
  padding: 24px 18px calc(16px + env(safe-area-inset-bottom));
  color: #fff;
  pointer-events: none;
}

.pet-voice-hold-overlay__bubble {
  justify-self: center;
  display: grid;
  min-width: min(260px, calc(100vw - 56px));
  gap: 10px;
  place-items: center;
  border-radius: 26px;
  background: #21856d;
  box-shadow: 0 16px 42px rgb(0 0 0 / 25%);
  padding: 22px 30px;
}

.pet-voice-hold-overlay__wave { display: flex; height: 38px; align-items: center; gap: 5px; }
.pet-voice-hold-overlay__wave span { width: 4px; height: 14px; border-radius: 999px; background: #e7fff5; animation: pet-voice-wave 680ms ease-in-out infinite alternate; }
.pet-voice-hold-overlay__wave span:nth-child(2) { animation-delay: 110ms; }
.pet-voice-hold-overlay__wave span:nth-child(3) { height: 30px; animation-delay: 220ms; }
.pet-voice-hold-overlay__wave span:nth-child(4) { animation-delay: 330ms; }
.pet-voice-hold-overlay__wave span:nth-child(5) { animation-delay: 440ms; }
.pet-voice-hold-overlay__targets { display: grid; width: min(480px, 100%); grid-template-columns: 1fr 1fr; gap: 14px; justify-self: center; padding-bottom: calc(6px + env(safe-area-inset-bottom)); }
.pet-voice-hold-overlay__target { display: grid; min-height: 56px; place-items: center; border-radius: 16px; background: rgb(255 255 255 / 14%); font-size: 14px; }
.pet-voice-hold-overlay.is-cancel-pending .pet-voice-hold-overlay__bubble,
.pet-voice-hold-overlay.is-cancel-pending .pet-voice-hold-overlay__target--cancel { background: #c75042; }

@keyframes pet-voice-wave { from { transform: scaleY(.48); opacity: .58; } to { transform: scaleY(1.2); opacity: 1; } }
```

- [ ] **Step 2: Add reduced-motion and narrow-screen rules**

Add this to the existing reduced-motion block and mobile breakpoint:

```css
@media (prefers-reduced-motion: reduce) {
  .pet-voice-hold-overlay__wave span { animation: none; }
}

@media (max-width: 720px) {
  .pet-voice-hold-overlay { padding-inline: 12px; }
  .pet-voice-hold-overlay__targets { gap: 9px; }
  .pet-voice-hold-overlay__target { font-size: 13px; }
}
```

- [ ] **Step 3: Run the contract test and verify it passes**

Run:

```powershell
node --test src/components/SciencePet.inplace-actions.contract.test.mjs
```

Expected: PASS, including the fixed overlay, safe-area, 56px target, and reduced-motion assertions.

- [ ] **Step 4: Run lint and production build**

Run:

```powershell
npm run lint
npm run build
```

Expected: ESLint has no new errors and Next.js reports a successful production build. Record any pre-existing environment warning separately from the result.

- [ ] **Step 5: Verify at a 390px mobile viewport**

Open the local home page, open 科小贝 chat, switch to voice mode, and hold the voice button. Verify all of the following:

```text
Overlay covers the visible viewport with a translucent dark layer.
Green bubble, waveform, and "松手转文字" are visible above the bottom target row.
The two 56px-or-larger targets remain above the safe area.
Dragging left changes the cancel target and bubble to the cancel state.
The page cannot interact with the composer or bottom navigation while the overlay is shown.
Releasing normally returns text to the composer without creating a chat message.
```

- [ ] **Step 6: Commit styling and final verification**

```powershell
git add -- robot-console/app/globals.css robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs
git commit -m "style: add mobile voice hold overlay"
```
