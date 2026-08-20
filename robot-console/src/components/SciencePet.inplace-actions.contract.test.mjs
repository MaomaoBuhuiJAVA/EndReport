import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/SciencePet.tsx"), "utf8").replace(/\r\n/g, "\n");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const composerStart = component.indexOf('<div className="pet-chat__composer">');
const composer = composerStart >= 0 ? component.slice(composerStart) : "";
const composerForm = composer.match(/<form className="pet-chat__form"[\s\S]*?<\/form>/)?.[0] ?? "";

test("keeps generation choices inside the existing pet composer", () => {
  assert.match(component, /完整教案/);
  assert.doesNotMatch(component, /同主题活动方案/);
  assert.match(component, /课件\s*\/\s*文档/);
  assert.match(component, /教案\s*\/\s*研修分析/);
  assert.doesNotMatch(component, /科学诗封面/);
  assert.match(component, /aria-label="更多功能"/);
});

test("uses a WeChat-like composer with five actions behind the up-arrow menu", () => {
  assert.match(component, /<textarea/);
  assert.match(component, /aria-label="更多功能"/);
  assert.match(component, /上传文件/);
  assert.match(component, /拍照提问/);
  const actions = component.match(/const creationActions = \[([\s\S]*?)\] as const/)?.[1] ?? "";
  assert.deepEqual(
    [...actions.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]),
    ["上传文件", "拍照提问", "完整教案", "课件 / 文档", "教案 / 研修分析"],
  );
  assert.match(component, /setMoreMenuOpen/);
  assert.match(styles, /\.pet-chat__more-menu/);
});

test("collects required creation details in a dialog before sending to the assistant", () => {
  assert.match(component, /role="dialog"/);
  assert.match(component, /年龄段/);
  assert.match(component, /主题/);
  assert.match(component, /时长/);
  assert.match(component, /输出格式/);
  assert.match(component, /creationDialog/);
});

test("submits a completed creation form through the chat pipeline without refilling the composer", () => {
  const submitCreationDialog = component.match(
    /function submitCreationDialog\(event: FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n  function handleAttachmentChange/,
  )?.[0] ?? "";

  assert.match(submitCreationDialog, /setCreationDialog\(null\);\s*setCreationDialogError\(""\);[\s\S]*?void sendMessage\(prompt, \{[\s\S]*?hideUserMessage: true/);
  assert.doesNotMatch(submitCreationDialog, /setInput\(prompt\)/);
  assert.doesNotMatch(submitCreationDialog, /focusComposerInput\(\)/);
});

test("requests a DOCX deliverable by default when generating a complete lesson plan", () => {
  const submitCreationDialog = component.match(
    /function submitCreationDialog\(event: FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n  function handleAttachmentChange/,
  )?.[0] ?? "";

  assert.match(submitCreationDialog, /format === "Word 文档" \? "请同时导出为 DOCX 文件。" : ""/);
});

test("formats complete lesson plan requests with the supplied kindergarten lesson-plan fields", () => {
  const submitCreationDialog = component.match(
    /function submitCreationDialog\(event: FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n  function handleAttachmentChange/,
  )?.[0] ?? "";

  assert.match(submitCreationDialog, /主题：《\$\{topic\.trim\(\)\}》/);
  assert.match(
    submitCreationDialog,
    /按示例字段交付：主题、领域、班级、来源、教学活动、时间、教师、活动目标、重点难点、活动准备、活动内容、备注、活动反思。/,
  );
  assert.match(submitCreationDialog, /导入猜想、分组操作、分享表达、总结延伸四个顺序阶段/);
});

test("submits the lesson-plan dialog with local DOCX fallback metadata", () => {
  const submitCreationDialog = component.match(
    /function submitCreationDialog\(event: FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n  function handleAttachmentChange/,
  )?.[0] ?? "";

  assert.match(submitCreationDialog, /const lessonPlan = creationDialog === "plan"[\s\S]*?title:\s*topic\.trim\(\)/);
  assert.match(submitCreationDialog, /wantsDocx:\s*format === "Word 文档"/);
  assert.match(component, /buildLessonPlanDocx/);
  assert.match(component, /URL\.createObjectURL/);
});

test("carries card lesson-plan metadata into the existing composer send", () => {
  assert.match(component, /type KexiaobeiOpenDetail = \{[\s\S]*lessonPlan\?: LessonPlanRequest/);
  assert.match(component, /pendingLessonPlanRef = useRef<PendingLessonPlanRequest \| null>\(null\)/);
  assert.match(component, /pendingLessonPlanRef\.current = prompt && detail\?\.lessonPlan/);
  assert.match(component, /const lessonPlan = options\?\.lessonPlan \?\?/);
  assert.match(component, /if \(lessonPlan\?\.wantsDocx && canPackageLessonPlan/);
});

test("does not package an error placeholder as a lesson-plan DOCX", () => {
  assert.match(component, /reply\.provider === "dify" \|\| reply\.provider === "fallback"/);
  assert.match(component, /活动目标/);
  assert.match(component, /活动准备/);
  assert.match(component, /活动内容/);
});

test("keeps the generation thinking state inside the single assistant bubble", () => {
  assert.match(component, /pending\?:\s*boolean/);
  assert.match(component, /pending:\s*true/);
  assert.match(component, /message\.pending/);
  assert.match(component, /message\.role === "assistant" && message\.pending && !message\.text/);
  assert.match(component, /pending:\s*false/);
  assert.doesNotMatch(component, /\{busy \? \(\s*<div className="pet-message pet-message--assistant">[\s\S]*正在思考[\s\S]*<\/div>\s*\) : null\}/);
});

test("uses a direct generation action label instead of refilling the composer", () => {
  assert.match(component, /<button type="submit" className="pet-chat__dialog-submit" disabled=\{busy\}>[\s\S]*开始生成/);
  assert.doesNotMatch(component, /填入对话框/);
});

test("keeps form-submitted lesson-plan instructions out of the visible user chat stream", () => {
  const submitCreationDialog = component.match(
    /function submitCreationDialog\(event: FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n  function handleAttachmentChange/,
  )?.[0] ?? "";
  const sendMessage = component.match(
    /async function sendMessage\(prompt: string[\s\S]*?\r?\n  \}\r?\n\r?\n  function handleSubmit/,
  )?.[0] ?? "";

  assert.match(submitCreationDialog, /void sendMessage\(prompt, \{[\s\S]*?hideUserMessage: true/);
  assert.match(component, /type SendMessageOptions = \{/);
  assert.match(sendMessage, /options\?: SendMessageOptions/);
  assert.match(sendMessage, /options\?\.hideUserMessage\s*\?\s*\[/);
});

test("requires a teaching or research file for material analysis", () => {
  assert.match(component, /请先上传教案或研修材料/);
  assert.match(component, /教案或研修材料/);
  assert.match(component, /selectedAttachment/);
});

test("shows a selected local attachment and posts it to the chat route as multipart data", () => {
  assert.match(component, /type="file"/);
  assert.match(component, /selectedAttachment/);
  assert.match(component, /pet-chat__attachment-preview/);
  assert.match(component, /new FormData\(\)/);
  assert.match(component, /formData\.append\("attachment", attachment\)/);
  assert.match(component, /body: formData \?\? JSON\.stringify/);
  assert.doesNotMatch(component, /\/api\/agent/);
});

test("keeps an uploaded file thumbnail above the sent user message", () => {
  assert.match(component, /type PetMessageAttachment = \{/);
  assert.match(component, /userAttachment\?: PetMessageAttachment/);
  assert.match(component, /className="pet-message__input-attachment"/);
  assert.match(component, /className="pet-message__input-attachment-thumbnail"/);
  assert.match(component, /userAttachment: messageAttachment/);
  assert.match(styles, /\.pet-message__input-attachment\s*\{/);
});

test("sends on Enter while retaining Shift+Enter for a newline and respecting composition", () => {
  assert.match(component, /function handleComposerKeyDown\(event: ReactKeyboardEvent<HTMLTextAreaElement>\)/);
  assert.match(component, /event\.nativeEvent\.isComposing/);
  assert.match(component, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(component, /event\.preventDefault\(\);[\s\S]*?void sendMessage\(composerMessage\(\)\)/);
  assert.match(composer, /onKeyDown=\{handleComposerKeyDown\}/);
});

test("shows server validation errors instead of replacing them with a generic connection error", () => {
  assert.match(component, /response\.json\(\)/);
  assert.match(component, /payload\.error/);
  assert.match(component, /我现在没有连上知识服务，请稍后再问一次/);
});

test("keeps the attachment status returned by the API in the assistant message", () => {
  assert.match(component, /attachment\?: AiChatAttachmentStatus/);
  assert.match(component, /attachment: event\.attachment/);
  assert.match(component, /message\.attachment\?\.status === "unavailable"/);
});

test("resets the camera input when an attachment is removed", () => {
  assert.match(component, /if \(photoInputRef\.current\) photoInputRef\.current\.value = ""/);
});

test("keeps the creation menu inside a narrow chat window", () => {
  const creationMenuRule = styles.match(/\.pet-chat__more-menu\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(creationMenuRule, /width:\s*min\(270px,\s*calc\(100vw\s*-\s*34px\)\)/);
  assert.doesNotMatch(creationMenuRule, /100dvw/);
});

test("gives the mobile chat window the full viewport width", () => {
  const mobileChatRule = styles.match(
    /\.pet-chat\s*\{\s*position:\s*fixed;([\s\S]*?)\n\}/,
  )?.[0] ?? "";
  assert.match(mobileChatRule, /position:\s*fixed/);
  assert.match(mobileChatRule, /left:\s*6px/);
  assert.match(mobileChatRule, /right:\s*6px/);
  assert.match(mobileChatRule, /width:\s*auto/);
  assert.match(mobileChatRule, /max-width:\s*none/);
});

test("lets menu labels use the grid cell width instead of the round-button width", () => {
  assert.match(
    styles,
    /\.pet-chat__form \.pet-chat__more-menu button\s*\{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*auto;/,
  );
});

test("keeps the composer in explicit text and voice modes with speaker and keyboard affordances", () => {
  assert.match(component, /const \[[A-Za-z]*[Mm]ode,\s*set[A-Za-z]*[Mm]ode\]\s*=\s*useState/);
  assert.match(component, /useState(?:<[^>\r\n]+>)?\(["']text["']\)/);
  assert.match(component, /["']voice["']/);
  assert.match(composer, /\bVolume2\b/);
  assert.match(composer, /\bKeyboard\b/);
});

test("uses a large voice-mode hold button with the existing pointer lifecycle", () => {
  assert.match(composer, /(?:composerMode|inputMode|mode)\s*===\s*["']voice["']/);
  assert.match(composer, /pet-chat__voice-mode/);

  const voiceButton =
    composer.match(/<button[\s\S]*?className=\{?`?pet-chat__voice-button[\s\S]*?<\/button>/)?.[0] ?? "";
  assert.match(voiceButton, /onPointerDown=\{startVoiceInput\}/);
  assert.match(voiceButton, /onPointerUp=\{stopVoiceInput\}/);

  const voiceButtonRule = styles.match(/\.pet-chat__composer \.pet-chat__voice-button\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(voiceButtonRule, /min-height:\s*48px/);
  assert.match(voiceButtonRule, /flex:\s*1/);
});

test("shows a hold-to-talk overlay with cancel and text-edit release targets", () => {
  assert.match(component, /type VoiceReleaseAction = "send" \| "cancel" \| "edit"/);
  assert.match(component, /const \[voiceReleaseAction, setVoiceReleaseAction\] = useState<VoiceReleaseAction>\("send"\)/);
  assert.match(component, /function updateVoiceReleaseTarget\(clientX: number, clientY: number\)/);
  assert.match(component, /onPointerMove=\{handleVoicePointerMove\}/);
  assert.match(component, /clientX > voiceStartXRef\.current \+ 72/);
  assert.match(component, /voiceCancelTargetRef/);
  assert.match(component, /voiceEditTargetRef/);
  assert.match(component, /getBoundingClientRect\(\)/);
  assert.match(component, /horizontalHitSlop = 18/);
  assert.match(component, /verticalHitSlop = 20/);
  assert.match(component, /hasVisibleReleaseTargets/);
  assert.match(component, /ref=\{voiceButtonRef\}[\s\S]*?className=\{`pet-chat__voice-button/);
  assert.doesNotMatch(component, /ref=\{voiceButtonRef\}[\s\S]*?className="pet-chat__attachment-remove"/);
  assert.match(component, /recognition\.abort\(\)/);
  assert.match(component, /setInput\(voiceBaseInputRef\.current\)/);
  assert.match(component, /className="pet-voice-hold-overlay"/);
  assert.match(component, /松手发送/);
  assert.match(component, /松手转文字/);
  assert.match(component, /pet-voice-hold-overlay__target--cancel/);
  assert.match(component, /pet-voice-hold-overlay__target--edit/);
  assert.match(component, /navigator\.mediaDevices\??\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(component, /analyser\.getByteTimeDomainData\(samples\)/);
});

test("sends on a normal release and opens an editable composer after a rightward slide", () => {
  const voiceInput = component.match(
    /function startVoiceInput\(event: ReactPointerEvent<HTMLButtonElement>\) \{[\s\S]*?(?=function updateVoiceReleaseTarget)/,
  )?.[0] ?? "";

  assert.match(voiceInput, /setInput\(`\$\{base\}\$\{base \? " " : ""\}\$\{spokenText\}`\)/);
  assert.match(voiceInput, /const releasedByUser = voiceReleasedRef\.current/);
  assert.match(voiceInput, /if \(releaseAction === "edit"\)/);
  assert.match(voiceInput, /setComposerMode\("text"\)/);
  assert.match(voiceInput, /语音已转成文字，可以修改后再发送。/);
  assert.match(voiceInput, /void sendMessage\(voiceText\)/);
  assert.match(voiceInput, /"not-allowed"/);
  assert.match(voiceInput, /"no-speech"/);
  assert.match(voiceInput, /network:/);
});

test("keeps voice hold targets above mobile safe areas and disables motion when requested", () => {
  assert.match(styles, /\.pet-voice-hold-overlay\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?z-index:\s*\d+/);
  assert.match(styles, /\.pet-voice-hold-overlay\s*\{[\s\S]*?--pet-voice-overlay-bottom:\s*calc\(150px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(styles, /\.pet-voice-hold-overlay\s*\{[\s\S]*?padding:\s*24px 18px var\(--pet-voice-overlay-bottom\);/);
  assert.match(styles, /\.pet-voice-hold-overlay__target\s*\{[\s\S]*?min-height:\s*56px;/);
  assert.match(styles, /\.pet-voice-hold-overlay__wave span\s*\{[\s\S]*?transform:\s*scaleY\(var\(--pet-voice-level/);
  assert.match(styles, /\.pet-voice-hold-overlay__target\.is-edit-pending/);
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.pet-voice-hold-overlay__wave span[\s\S]*?transition:\s*none;/);
});

test("places the release choices and waveform above the mobile press-to-talk bar", () => {
  assert.match(styles, /@media \(max-width: 1023px\) \{[\s\S]*?\.pet-chat\s*\{[\s\S]*?bottom:\s*calc\(82px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(styles, /@media \(max-width: 1023px\) \{[\s\S]*?\.pet-chat__form\s*\{[\s\S]*?min-height:\s*56px;/);
  assert.match(component, /const measureVoiceOverlayBottom = useCallback/);
  assert.match(component, /button\.getBoundingClientRect\(\)/);
  assert.match(component, /setVoiceOverlayBottom\(/);
  assert.match(component, /"--pet-voice-overlay-bottom": `\$\{voiceOverlayBottom\}px`/);
});

test("places the up-chevron more action before the mode toggle and text input", () => {
  assert.match(composerForm, /\bChevronUp\b/);

  const moreIndex = composerForm.indexOf("pet-chat__more-trigger");
  const modeIndex = composerForm.indexOf("pet-chat__voice-mode");
  const inputIndex = composerForm.indexOf("pet-chat__input");
  assert.ok(moreIndex >= 0, "more action trigger should be present");
  assert.ok(modeIndex > moreIndex, "more action should precede the mode toggle");
  assert.ok(inputIndex > modeIndex, "mode toggle should precede the text input");
});

test("gives the composer send action a named dark treatment", () => {
  assert.match(composerForm, /pet-chat__send/);

  const sendRule = styles.match(/\.pet-chat__send\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(sendRule, "send action should have a dedicated CSS rule");
  assert.match(sendRule, /background:\s*[^;]+;/);
  assert.match(sendRule, /color:\s*(?:#fff|white)\b/i);
});

test("puts the creation menu trigger at the start of the composer", () => {
  assert.match(component, /<ChevronUp\s+size=\{18\}\s*\/>/);
  assert.match(styles, /\.pet-chat__more-trigger/);
  assert.match(component, /className="[^"]*pet-chat__more-trigger[^"]*"[\s\S]*?aria-label="更多功能"/);
});

test("switches between text and voice composer modes with speaker and keyboard controls", () => {
  assert.match(component, /type ComposerMode = "text" \| "voice"/);
  assert.match(component, /const \[composerMode, setComposerMode\] = useState<ComposerMode>\("text"\)/);
  assert.match(component, /<Volume2\s+size=\{17\}\s*\/>/);
  assert.match(component, /<Keyboard\s+size=\{17\}\s*\/>/);
  assert.match(component, /pet-chat__voice-mode/);
});

test("renders a large press-and-hold voice button in voice mode", () => {
  assert.match(component, /composerMode === "voice"/);
  assert.match(component, /className=\{`pet-chat__voice-button/);
  assert.match(component, /aria-label="按住说话"/);
  assert.match(component, /onPointerDown=\{startVoiceInput\}/);
  assert.match(component, /onPointerUp=\{stopVoiceInput\}/);
  assert.match(styles, /\.pet-chat__voice-button/);
});

test("supports WeChat-like voice gestures with a visible live transcript", () => {
  assert.match(component, /type VoiceGesture = "send" \| "cancel" \| "transcribe"/);
  assert.match(component, /onPointerMove=\{handleVoicePointerMove\}/);
  assert.match(component, /onPointerCancel=\{cancelVoiceInput\}/);
  assert.match(component, /action === "transcribe"/);
  assert.match(component, /setComposerMode\("text"\)/);
  assert.match(composer, /pet-chat__voice-hold/);
  assert.match(composer, /voiceDraft/);
  assert.match(styles, /\.pet-chat__voice-hold/);
  assert.match(styles, /\.pet-chat__voice-hold-actions/);
});

test("keeps the mobile chat sheet stable for expanded Android viewports", () => {
  assert.match(
    styles,
    /@media \(min-width: 721px\) and \(max-width: 1023px\)[\s\S]*?\.pet-chat\s*\{[\s\S]*?position:\s*fixed[\s\S]*?left:\s*6px[\s\S]*?width:\s*auto/,
  );
});

test("styles the send control with a dark background", () => {
  const sendRule = styles.match(/\.pet-chat__send\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(sendRule, /background:\s*#21312e/);
  assert.match(component, /className="pet-chat__send"/);
  assert.match(styles, /\.pet-chat__form \.pet-chat__send\s*\{[\s\S]*?background:\s*#21312e/);
});

test("anchors the left-side creation menu to the right of its trigger", () => {
  const menuRule = styles.match(/\.pet-chat__more-menu\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(menuRule, /left:\s*0/);
  assert.doesNotMatch(menuRule, /right:\s*0/);
});

test("keeps the more and voice mode buttons the same size", () => {
  assert.match(composerForm, /className="pet-chat__composer-control pet-chat__more-trigger"/);
  assert.match(composerForm, /className="pet-chat__composer-control pet-chat__voice-mode"/);
  assert.match(
    styles,
    /\.pet-chat__composer \.pet-chat__composer-control\s*\{[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;/,
  );
  assert.match(
    styles,
    /@media\s*\(max-width:\s*720px\)[\s\S]*?\.pet-chat__composer \.pet-chat__composer-control\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;/,
  );
});

test("matches the composer input text size to chat messages", () => {
  const inputRule = styles.match(/\.pet-chat__form input,\s*\.pet-chat__form textarea\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const messageRule = styles.match(/\.pet-message\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(inputRule, /font-size:\s*12px/);
  assert.match(messageRule, /font-size:\s*12px/);
});
