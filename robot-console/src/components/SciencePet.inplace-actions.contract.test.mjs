import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const component = fs.readFileSync(path.resolve("src/components/SciencePet.tsx"), "utf8");
const styles = fs.readFileSync(path.resolve("app/globals.css"), "utf8");
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

test("collects required creation details in a dialog before pre-filling the assistant", () => {
  assert.match(component, /role="dialog"/);
  assert.match(component, /年龄段/);
  assert.match(component, /主题/);
  assert.match(component, /时长/);
  assert.match(component, /输出格式/);
  assert.match(component, /creationDialog/);
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
  assert.match(voiceButtonRule, /min-height:\s*40px/);
  assert.match(voiceButtonRule, /flex:\s*1/);
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
