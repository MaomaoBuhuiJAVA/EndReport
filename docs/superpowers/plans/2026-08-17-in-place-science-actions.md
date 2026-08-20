# In-Place Science Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-only generation-menu, attachment-preview, and experiment-card action affordances to the existing pages without adding routes or invoking new Dify services.

**Architecture:** `SciencePet` remains the single chat surface. Its new menu inserts a prompt into the existing text input, and its attachment control holds a local browser `File` for preview only; submission remains the existing text-only request. `ScienceLab` adds a sibling action control to experiment cards and dispatches the existing `kexiaobei:open` event with a prefilled prompt, so the card body continues to open the current resource dialog.

**Tech Stack:** Next.js 16, React 19, TypeScript, Lucide, existing CSS in `app/globals.css`, Node contract tests.

**Scope exclusions:** No Dify proxy, no file upload API, no image analysis, no automatic science-poem cover generation, no new page, route, data model, or storage. Do not modify the already-dirty story-cover or video-playback changes in `ScienceLab.tsx`.

---

### Task 1: Add regression contracts for the local-only interaction boundary

**Files:**
- Create: `robot-console/src/components/SciencePet.inplace-actions.contract.test.mjs`
- Create: `robot-console/src/components/ScienceLab.agent-actions.contract.test.mjs`

- [ ] **Step 1: Write the failing chat interaction contract**

```js
test("keeps generation choices inside the existing pet composer", () => {
  assert.match(component, /完整教案/);
  assert.match(component, /同主题活动方案/);
  assert.match(component, /课件\s*\/\s*文档/);
  assert.match(component, /教案\s*\/\s*研修分析/);
  assert.doesNotMatch(component, /科学诗封面/);
  assert.match(component, /aria-label="创作与生成"/);
});

test("shows a selected local attachment above the input without posting file bytes", () => {
  assert.match(component, /type="file"/);
  assert.match(component, /selectedAttachment/);
  assert.match(component, /pet-chat__attachment-preview/);
  assert.doesNotMatch(component, /FormData/);
  assert.doesNotMatch(component, /\/api\/agent/);
});
```

- [ ] **Step 2: Write the failing experiment-card contract**

```js
test("adds an AI menu only to experiment cards", () => {
  assert.match(component, /item\.category === "科学实验"/);
  assert.match(component, /aria-label={`打开《\$\{item\.title\}》的 AI 操作`}/);
  assert.match(component, /AI 解析这个实验/);
  assert.match(component, /生成类似主题方案/);
});

test("opens the existing pet and pre-fills a prompt instead of calling an agent API", () => {
  assert.match(component, /new CustomEvent\("kexiaobei:open"/);
  assert.match(component, /detail: \{ prompt/);
  assert.doesNotMatch(component, /fetch\(/);
});
```

- [ ] **Step 3: Run the new contracts and confirm they fail**

Run:

```powershell
node --test src/components/SciencePet.inplace-actions.contract.test.mjs src/components/ScienceLab.agent-actions.contract.test.mjs
```

Expected: both files fail because the controls and prompt payload do not yet exist.

- [ ] **Step 4: Keep test scope independent of the existing video contract**

Do not edit `ScienceLab.hero.contract.test.mjs`; its current video-URL mismatch belongs to pre-existing dirty work and is outside this feature.

### Task 2: Implement composer menu and local attachment preview in `SciencePet`

**Files:**
- Modify: `robot-console/src/components/SciencePet.tsx`
- Modify: `robot-console/app/globals.css`

- [ ] **Step 1: Add local state and stable preset definitions**

Add four entries near the existing `starters` constant:

```ts
const creationPresets = [
  { label: "完整教案", prompt: "请生成完整教案。我会补充年龄段、主题和时长。" },
  { label: "同主题活动方案", prompt: "请围绕同一主题生成一份适龄活动方案。" },
  { label: "课件 / 文档", prompt: "请帮我策划课件或教学文档。我会补充用途和格式。" },
  { label: "教案 / 研修分析", prompt: "请分析我的教案或研修材料，并给出可执行的改进建议。" },
] as const;
```

Inside `SciencePet`, add `creationMenuOpen`, `selectedAttachment`, `attachmentInputRef`, and an `inputRef`. Use `File | null` for the attachment, never convert the file to Base64 or `FormData`.

- [ ] **Step 2: Extend the existing open event to accept an optional prefill**

Replace the no-argument listener with an event handler that retains its current behavior and supports a prompt:

```ts
function openChat(event?: Event) {
  assistantWindow.__kexiaobeiOpenRequested = false;
  const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt?.trim();
  if (prompt) setInput(prompt);
  setOpen(true);
  window.requestAnimationFrame(() => inputRef.current?.focus());
}
```

The existing bare `window.dispatchEvent(new Event("kexiaobei:open"))` callers must still work.

- [ ] **Step 3: Render one icon trigger, a four-item disclosure menu, and a local file chooser**

Place these within `.pet-chat__composer`, above the existing form:

```tsx
<div className="pet-chat__creation">
  <button aria-label="创作与生成" aria-expanded={creationMenuOpen} type="button" ...>
    <Sparkles size={15} />
  </button>
  {creationMenuOpen ? <div className="pet-chat__creation-menu" role="menu">...</div> : null}
</div>
{selectedAttachment ? <div className="pet-chat__attachment-preview">...</div> : null}
<input ref={attachmentInputRef} className="sr-only" type="file" accept="image/*,.txt,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" onChange={handleAttachmentChange} />
```

The `+` button beside the existing voice/send controls calls `attachmentInputRef.current?.click()`. A selected image uses `URL.createObjectURL` only for its thumbnail and revokes the URL in cleanup; non-image files show `FileText`. The remove button clears the input value and selected state.

- [ ] **Step 4: Preserve the text-only request contract**

`sendMessage` keeps calling `requestAssistantReply(content, history)` with text/history only. If a local attachment is present when sending, keep it selected and show no claim that its content was analyzed. Do not add an agent endpoint or modify `app/api/ai-chat/route.ts`.

- [ ] **Step 5: Add responsive styles without moving existing voice controls**

Add scoped styles for `.pet-chat__creation`, `.pet-chat__creation-menu`, `.pet-chat__attachment-preview`, `.pet-chat__attachment-thumbnail`, and `.pet-chat__attachment-remove`. Keep all compact on the existing 360px chat width and make the menu wrap as two columns. Include `:focus-visible` rules in the existing pet focus selector group.

- [ ] **Step 6: Run the chat contract**

Run:

```powershell
node --test src/components/SciencePet.contract.test.mjs src/components/SciencePet.inplace-actions.contract.test.mjs
```

Expected: all selected tests pass.

### Task 3: Add the in-place experiment-card AI action menu

**Files:**
- Modify: `robot-console/src/components/ScienceLab.tsx`
- Modify: `robot-console/app/globals.css`

- [ ] **Step 1: Preserve card activation and add a sibling AI action shell**

Keep the existing `<button className="knowledge-card">` as the card-detail activator. Wrap it in a relative `.knowledge-card-shell`, then render `.knowledge-card__agent-actions` as a sibling only when `item.category === "科学实验"`. This avoids invalid nested buttons.

- [ ] **Step 2: Build and dispatch explicit preset prompts**

Pass a callback from `ScienceLab` to `KnowledgeCard`. The callback uses a real item title, topic, age label, and stable ID:

```ts
const prompt = action === "analyze"
  ? `请解析科学实验《${item.title}》。年龄段：${item.ageLabel || "未指定"}；主题：${item.topic || "未指定"}；资源 ID：${item.id}。我会继续补充现场观察或图片。`
  : `请参考科学实验《${item.title}》生成类似主题活动方案。年龄段：${item.ageLabel || "未指定"}；主题：${item.topic || "未指定"}；资源 ID：${item.id}。`;
window.dispatchEvent(new CustomEvent("kexiaobei:open", { detail: { prompt } }));
```

The two menu buttons must close the menu before dispatching. No fetch, agent API, or automatic send occurs.

- [ ] **Step 3: Position the trigger in the requested footer gap**

Use `Sparkles` with `aria-label={`打开《${item.title}》的 AI 操作`}` and `title="AI 实验操作"`. CSS places it after the resource icons and before `.knowledge-card__open` using an absolute action shell. At narrow widths, retain the trigger and move it beside the text link rather than overlapping it.

- [ ] **Step 4: Support close behavior**

Close the menu after an action, on `Escape`, and when pointer input occurs outside the action shell. Use an element ref and a scoped document listener while the menu is open.

- [ ] **Step 5: Run lab contracts**

Run:

```powershell
node --test src/components/ScienceLab.feedback.contract.test.mjs src/components/ScienceLab.agent-actions.contract.test.mjs
```

Expected: both selected contracts pass. The existing hero contract is intentionally excluded because it currently fails on unrelated uncommitted video work.

### Task 4: Typecheck, visual verification, and non-regression checks

**Files:**
- Modify only if a test exposes a defect in the files above.

- [ ] **Step 1: Run targeted type and contract checks**

Run:

```powershell
npm test -- --run src/components/SciencePet.contract.test.mjs
node --test src/components/SciencePet.inplace-actions.contract.test.mjs src/components/ScienceLab.agent-actions.contract.test.mjs
```

Expected: targeted checks pass.

- [ ] **Step 2: Start the existing Next.js application and inspect both viewports**

Run:

```powershell
npm run dev -- --webpack
```

Inspect the home chat at desktop and 390px mobile: menu opens/closes, each choice pre-fills input, file picker preview/removal works locally, and voice/send buttons remain usable. Inspect `/lab`: experiment AI trigger fits between resource indicators and “查看资料”, both choices open the existing chat with a prefilled prompt, and normal card clicks still open the detail dialog.

- [ ] **Step 3: Report known unrelated test state honestly**

Do not claim the full science suite is green until the unrelated dirty `ScienceLab.hero.contract.test.mjs` regular expression has been reconciled with its video implementation. Preserve all user changes and do not commit in this dirty worktree.
